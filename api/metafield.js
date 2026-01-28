// /api/metafield.js
export default async function handler(req, res) {
  if (req.method !== 'POST') 
    return res.status(405).json({ ok:false, error:'Método no permitido' });

  try {
    const { handle, cambios } = req.body;
    if (!handle || !cambios) 
      return res.status(400).json({ ok:false, error:'Datos incompletos' });

    const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
    const VERSION = '2024-07';

    // --- Leer producto por handle ---
    const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({
        query: `
          query($handle: String!){
            productByHandle(handle: $handle){
              id
              metafield(namespace:"custom", key:"sucursales"){ value }
            }
          }
        `,
        variables:{ handle }
      })
    });

    const json = await productRes.json();
    const product = json?.data?.productByHandle;

    if(!product) 
      return res.status(404).json({ ok:false, error:'Producto no encontrado' });

    // --- Parsear JSON y forzar estructura si está vacío ---
    let data;
    try {
      data = JSON.parse(product.metafield.value);
    } catch(e) {
      // Forzar estructura base si no existe o es inválido
      data = {
        sucursales: [
          { nombre: "Suc. Centro", cantidad: 0 },
          { nombre: "Suc. Coyoacán", cantidad: 0 },
          { nombre: "Suc. Benito Juárez", cantidad: 0 },
          { nombre: "Suc. Gustavo Baz", cantidad: 0 },
          { nombre: "Suc. Naucalpan", cantidad: 0 },
          { nombre: "Suc. Toluca", cantidad: 0 },
          { nombre: "Suc. Querétaro", cantidad: 0 },
          { nombre: "Suc. Vallejo", cantidad: 0 },
          { nombre: "Suc. Puebla", cantidad: 0 }
        ]
      };
    }

    // --- Actualizar solo sucursales que cambian ---
    Object.entries(cambios).forEach(([sucursal, cantidad]) => {
      const idx = data.sucursales.findIndex(s => s.nombre === sucursal);
      if(idx !== -1) data.sucursales[idx].cantidad = Number(cantidad);
    });

    // --- Guardar metafield ---
    const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({
        query: `
          mutation($mf:[MetafieldsSetInput!]!){
            metafieldsSet(metafields:$mf){
              metafields{id}
              userErrors{field,message}
            }
          }
        `,
        variables:{
          mf:[{
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
    if(errors?.length) 
      return res.status(400).json({ ok:false, error: errors[0].message });

    // --- Devolver stock actualizado FORZANDO que siempre sea JSON ---
    return res.json({ ok:true, sucursales: data.sucursales });

  } catch(err) {
    console.error(err);
    return res.status(500).json({ ok:false, error:err.message });
  }
}
