// /pages/api/metafield.js
export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*'); // producción: restringir a tu dominio
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = '2024-07';

  try {
    const { handle, sku, cantidad } = req.method === 'POST' ? req.body : req.query;

    if (!handle && !sku) return res.status(400).json({ ok:false, error:'Falta handle o sku' });

    // -----------------------------
    // Buscar producto por handle o SKU
    // -----------------------------
    let query = '';
    let variables = {};

    if(handle){
      query = `
        query($handle: String!) {
          productByHandle(handle: $handle) {
            id
            variants(first:1) { edges { node { id sku } } }
            metafield(namespace:"custom", key:"stock_por_sucursal"){ value type }
          }
        }
      `;
      variables = { handle };
    } else if(sku){
      query = `
        query($sku: String!) {
          products(first:1, query: $sku) {
            edges {
              node {
                id
                handle
                variants(first:1) { edges { node { id sku } } }
                metafield(namespace:"custom", key:"stock_por_sucursal"){ value type }
              }
            }
          }
        }
      `;
      variables = { sku };
    }

    const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Shopify-Access-Token':TOKEN
      },
      body: JSON.stringify({ query, variables })
    });

    const productJson = await productRes.json();
    let product = handle 
      ? productJson?.data?.productByHandle 
      : productJson?.data?.products?.edges?.[0]?.node;

    if(!product) return res.status(404).json({ ok:false, error:'Producto no encontrado' });

    // -----------------------------
    // GET → devolver stock
    // -----------------------------
    if(req.method === 'GET'){
      const stock = Number(product.metafield?.value || 0);
      return res.json({ ok:true, stock, handle: product.handle, sku: product.variants.edges[0].node.sku });
    }

    // -----------------------------
    // POST → actualizar stock
    // -----------------------------
    if(req.method === 'POST'){
      if(cantidad == null) return res.status(400).json({ ok:false, error:'Falta cantidad' });

      const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Shopify-Access-Token':TOKEN
        },
        body: JSON.stringify({
          query: `
            mutation($mf:[MetafieldsSetInput!]!) {
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

      return res.json({ ok:true, stock: cantidad, handle: product.handle, sku: product.variants.edges[0].node.sku });
    }

    // -----------------------------
    // Método no permitido
    // -----------------------------
    return res.status(405).json({ ok:false, error:'Método no permitido' });

  } catch(err){
    console.error('Error API /api/metafield:', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}
