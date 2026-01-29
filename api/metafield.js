// /pages/api/metafield.js
export default async function handler(req, res) {
  const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = '2024-07';

  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle, cantidad } = req.body || {};

    if (!handle) return res.status(400).json({ ok:false, error:'Falta handle' });

    // -----------------------------
    // Obtener productId
    // -----------------------------
    const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Shopify-Access-Token':TOKEN
      },
      body: JSON.stringify({
        query: `
          query($handle:String!){
            productByHandle(handle:$handle){
              id
            }
          }
        `,
        variables: { handle }
      })
    });

    const productJson = await productRes.json();
    const productId = productJson?.data?.productByHandle?.id;
    if (!productId) return res.status(404).json({ ok:false, error:'Producto no encontrado' });

    // -----------------------------
    // Si es GET → devolver stock actual
    // -----------------------------
    if (req.method === 'GET') {
      const stockRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Shopify-Access-Token':TOKEN
        },
        body: JSON.stringify({
          query: `
            query($id:ID!){
              product(id:$id){
                metafield(namespace:"custom", key:"stock_por_sucursal"){
                  value
                  type
                }
              }
            }
          `,
          variables: { id: productId }
        })
      });

      const stockJson = await stockRes.json();
      const value = stockJson?.data?.product?.metafield?.value ?? 0;
      return res.json({ ok:true, stock: Number(value) });
    }

    // -----------------------------
    // Si es POST → actualizar stock
    // -----------------------------
    if (req.method === 'POST') {
      if (cantidad == null) return res.status(400).json({ ok:false, error:'Falta cantidad' });

      const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Shopify-Access-Token':TOKEN
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
          variables:{
            mf:[{
              ownerId: productId,
              namespace: 'custom',
              key: 'stock_por_sucursal',
              type: 'number_integer',
              value: String(cantidad)
            }]
          }
        })
      });

      const saveJson = await saveRes.json();
      const errors = saveJson?.data?.metafieldsSet?.userErrors;
      if(errors?.length) return res.status(400).json({ ok:false, error: errors[0].message });

      return res.json({ ok:true, stock: cantidad });
    }

    return res.status(405).json({ ok:false, error:'Método no permitido' });

  } catch(err) {
    console.error('Error /api/metafield:', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}
