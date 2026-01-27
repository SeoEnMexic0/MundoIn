export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Método no permitido' });

  try {
    const { handle, sku, cambios } = req.body;

    if (!handle || !sku || !cambios)
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });

    /* ================= CONFIG ================= */
    const SHOP = 'mundoin.mx';
    const ADMIN = 'mundo-in.myshopify.com';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
    const API = '2026-01';

    const gql = async (query, variables = {}) => {
      const r = await fetch(`https://${ADMIN}/admin/api/${API}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN
        },
        body: JSON.stringify({ query, variables })
      });
      return r.json();
    };

    /* ========== 1. PRODUCTO POR HANDLE ========= */
    const productRes = await gql(`
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
          metafield(namespace:"custom", key:"sucursales") {
            id
            value
          }
        }
      }
    `, { handle });

    const product = productRes?.data?.productByHandle;
    if (!product)
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    /* ========== 2. METAFIELD ACTUAL ============= */
    let data = product.metafield
      ? JSON.parse(product.metafield.value)
      : null;

    if (!data || !data.sucursales || !data.variantes)
      return res.status(400).json({ ok: false, error: 'Metafield inválido' });

    /* ========== 3. MAPA DE SUCURSALES =========== */
    const SUCS = data.sucursales.map(s => s.nombre);

    /* ========== 4. VARIANTE POR SKU ============= */
    const variante = data.variantes.find(v =>
      v.sku === sku ||
      v.opciones?.some(o => o.valor === sku) // fallback
    );

    if (!variante)
      return res.status(404).json({ ok: false, error: 'Variante no encontrada' });

    /* ========== 5. MERGE DE STOCK =============== */
    variante.cantidades = variante.cantidades || Array(SUCS.length).fill(0);

    Object.entries(cambios).forEach(([nombre, valor]) => {
      const idx = SUCS.indexOf(nombre);
      if (idx === -1) return;

      // SOLO guardar si viene definido (permite 0)
      if (valor !== '' && valor !== null && valor !== undefined) {
        variante.cantidades[idx] = Number(valor);
      }
    });

    /* ========== 6. GUARDAR METAFIELD ============ */
    const save = await gql(`
      mutation ($mf: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $mf) {
          userErrors { message }
        }
      }
    `, {
      mf: [{
        ownerId: product.id,
        namespace: 'custom',
        key: 'sucursales',
        type: 'json',
        value: JSON.stringify(data)
      }]
    });

    const errors = save?.data?.metafieldsSet?.userErrors;
    if (errors?.length)
      return res.status(400).json({ ok: false, error: errors[0].message });

    return res.json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
