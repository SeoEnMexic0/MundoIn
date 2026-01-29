export default async function handler(req, res) {
  // --- CORS: permitir solicitudes desde Shopify ---
  // Temporalmente '*' para probar; luego puedes restringir a 'https://mundoin.mx'
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder OPTIONS (preflight) rápidamente
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { handle, cambios } = req.body;
    if (!handle || !cambios) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }

    const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com'; // tu tienda
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;      // token admin privado
    const VERSION = '2024-07';

    // --- Obtener producto por handle ---
    const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({
        query: `
          query($handle: String!){
            productByHandle(handle: $handle){
              id
              metafield(namespace:"custom", key:"sucursales"){ value type }
            }
          }
        `,
        variables: { handle }
      })
    });

    const json = await productRes.json();
    const product = json?.data?.productByHandle;
    if (!product) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }

    // --- Parse seguro del JSON ---
    let data;
    try {
      data = JSON.parse(product.metafield.value);
    } catch {
      data = { sucursales: [] };
    }

    // --- Actualizar solo sucursales que cambian ---
    Object.entries(cambios).forEach(([sucursal, cantidad]) => {
      const idx = data.sucursales.findIndex(s => s.nombre === sucursal);
      if (idx !== -1) data.sucursales[idx].cantidad = Number(cantidad);
    });

    // --- Guardar de nuevo el metafield ---
    const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({
        query: `
          mutation($mf:[MetafieldsSetInput!]!){
            metafieldsSet(metafields:$mf){
              metafields{id value type}
              userErrors{field,message}
            }
          }
        `,
        variables: {
          mf: [{
            ownerId: product.id,
            namespace: 'custom',
            key: 'sucursales',
            type: 'json',
            value: JSON.stringify(data)
          }]
        }
      })
    });

    const saveJson = await saveRes.json();
    const errors = saveJson?.data?.metafieldsSet?.userErrors;
    if (errors?.length) {
      return res.status(400).json({ ok: false, error: errors[0].message });
    }

    // --- Devolver stock actualizado ---
    return res.json({ ok: true, sucursales: data.sucursales });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
