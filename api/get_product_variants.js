export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { handle } = req.query;
    if (!handle) {
      return res.status(400).json({ ok: false, error: 'Handle requerido' });
    }

    /* ================= CONFIG ================= */
    const ADMIN = 'mundo-in.myshopify.com';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
    const API = '2024-10';

    if (!TOKEN) throw new Error('SHOPIFY_ADMIN_TOKEN no definido');

    const gql = async (query, variables = {}) => {
      const r = await fetch(`https://${ADMIN}/admin/api/${API}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN
        },
        body: JSON.stringify({ query, variables })
      });
      const json = await r.json();
      if (json.errors) throw new Error(json.errors[0].message);
      return json;
    };

    /* ========== 1. PRODUCTO + METAFIELD ======= */
    const productRes = await gql(`
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          options {
            name
          }
          metafield(namespace: "custom", key: "sucursales") {
            value
          }
        }
      }
    `, { handle });

    const product = productRes?.data?.productByHandle;
    if (!product) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }

    if (!product.metafield) {
      return res.status(400).json({ ok: false, error: 'Metafield no existe' });
    }

    let data;
    try {
      data = JSON.parse(product.metafield.value);
    } catch {
      return res.status(400).json({ ok: false, error: 'Metafield JSON inválido' });
    }

    if (!Array.isArray(data.sucursales) || !Array.isArray(data.variantes)) {
      return res.status(400).json({ ok: false, error: 'Estructura de metafield inválida' });
    }

    /* ========== 2. RESPUESTA PARA UI ========== */
    const variants = data.variantes.map(v => {
      const options = {};
      if (Array.isArray(v.opciones)) {
        v.opciones.forEach(o => {
          options[o.nombre] = o.valor;
        });
      }

      return {
        sku: v.sku,
        options,
        cantidades: v.cantidades || []
      };
    });

    return res.json({
      ok: true,
      product: {
        handle,
        title: product.title
      },
      sucursales: data.sucursales.map(s => s.nombre),
      variants
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
