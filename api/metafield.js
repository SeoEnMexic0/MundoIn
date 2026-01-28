// /api/metafield.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Método no permitido' });

  try {
    const { handle, cambios } = req.body;

    if (!handle || !cambios || Object.keys(cambios).length === 0)
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });

    const SHOPIFY_ADMIN = 'mundo-jm-test.myshopify.com'; // tienda de prueba
    const API_VERSION = '2026-01';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN; // tu token de Admin API

    if (!TOKEN) return res.status(500).json({ ok: false, error: 'Falta el token de Shopify en Vercel' });

    // Función genérica para GraphQL
    const gql = async (query, variables = {}) => {
      const r = await fetch(`https://${SHOPIFY_ADMIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN
        },
        body: JSON.stringify({ query, variables })
      });
      return r.json();
    };

    // 1️⃣ Obtener producto por handle
    const prodRes = await gql(`
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
          metafield(namespace:"custom", key:"sucursales") {
            value
          }
        }
      }
    `, { handle });

    const product = prodRes?.data?.productByHandle;
    if (!product) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    let data = { sucursales: [] };

    // 2️⃣ Parsear metafield existente si hay
    if (product.metafield?.value) {
      try { data = JSON.parse(product.metafield.value); } catch(e){ /* ignorar */ }
    }

    // 3️⃣ Si no hay sucursales definidas, crearlas con 0
    const nombres = Object.keys(cambios);
    if (!data.sucursales || !data.sucursales.length) {
      data.sucursales = nombres.map(s => ({ nombre: s, cantidad: 0 }));
    }

    // 4️⃣ Merge de cambios
    data.sucursales.forEach(s => {
      if (cambios[s.nombre] !== undefined) {
        s.cantidad = Number(cambios[s.nombre]) || 0;
      }
    });

    // 5️⃣ Guardar el metafield
    const saveRes = await gql(`
      mutation ($mf: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $mf) {
          metafields { id value }
          userErrors { field message }
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

    const errors = saveRes?.data?.metafieldsSet?.userErrors;
    if (errors && errors.length > 0)
      return res.status(400).json({ ok: false, error: errors[0].message });

    return res.json({ ok: true, message: 'Metafield actualizado', sucursales: data.sucursales });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
