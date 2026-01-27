export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { csv } = req.body;
    if (!csv) throw new Error('CSV no recibido');

    const host = 'mundo-in.myshopify.com';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;

    /* =======================
       UTILIDADES
    ======================= */

    const normalize = (str = '') =>
      str.toString()
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]/g, '');

    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV vacío');

    const rawHeaders = lines[0].split(',');
    const headers = rawHeaders.map(normalize);

    if (!headers.includes('HANDLE')) {
      throw new Error('Falta columna HANDLE');
    }

    const rows = lines.slice(1).map(line => {
      const cols = line.split(',');
      const obj = {};
      headers.forEach((h, i) => obj[h] = cols[i]?.trim() ?? '');
      return obj;
    });

    /* =======================
       SHOPIFY HELPERS
    ======================= */

    async function shopify(query, variables = {}) {
      const r = await fetch(gqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token
        },
        body: JSON.stringify({ query, variables })
      });
      return r.json();
    }

    async function getVariantsByHandle(handle) {
      const q = `
        query ($handle: String!) {
          productByHandle(handle: $handle) {
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      `;
      const r = await shopify(q, { handle });
      return r?.data?.productByHandle?.variants?.edges || [];
    }

    async function setMetafield(variantId, value) {
      const mutation = `
        mutation ($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { message }
          }
        }
      `;

      const r = await shopify(mutation, {
        metafields: [{
          ownerId: variantId,
          namespace: 'custom',
          key: 'sucursales',
          type: 'json',
          value: JSON.stringify(value)
        }]
      });

      const err = r?.data?.metafieldsSet?.userErrors;
      if (err?.length) throw new Error(err[0].message);
    }

    /* =======================
       PROCESO PRINCIPAL
    ======================= */

    let inserts = 0;

    for (const row of rows) {
      const handle = row.HANDLE;
      const sku = row.SKU || null;
      const option1 = row.OPTION1VALUE || null;
      const option2 = row.OPTION2VALUE || null;

      const variants = await getVariantsByHandle(handle);
      if (!variants.length) continue;

      const match = variants.find(v => {
        if (sku && v.node.sku === sku) return true;

        const opts = v.node.selectedOptions;
        const o1 = opts.find(o => o.value === option1);
        const o2 = option2 ? opts.find(o => o.value === option2) : true;

        return o1 && o2;
      });

      if (!match) continue;

      const sucursales = {};
      Object.keys(row).forEach(k => {
        if (k.startsWith('SUC')) {
          sucursales[k.replace('SUC', '').toLowerCase()] = Number(row[k] || 0);
        }
      });

      await setMetafield(match.node.id, sucursales);
      inserts++;
    }

    return res.status(200).json({
      ok: true,
      inserts
    });

  } catch (error) {
    console.error('ERROR:', error.message);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
