export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const STORE = 'mundo-jm-test.myshopify.com';
  const API_VERSION = '2026-01';

  const gql = async (query, variables = {}) => {
    const r = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({ query, variables })
    });
    return r.json();
  };

  try {
    const { handle, cambios } = req.body;

    // Obtener producto por handle
    const productRes = await gql(`
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
          metafield(namespace:"custom", key:"sucursales") {
            value
          }
        }
      }
    `, { handle });

    const product = productRes?.data?.productByHandle;
    if (!product) return res.status(404).json({ ok:false, error:'Producto no encontrado' });

    let data;
    if(product.metafield?.value) {
      data = JSON.parse(product.metafield.value);
    } else {
      // Si no hay metafield, crear estructura inicial
      data = { sucursales: [
        { "nombre": "WEB", "cantidad": 0 },
        { "nombre": "Suc. Centro", "cantidad": 0 },
        { "nombre": "Suc. Coyoacán", "cantidad": 0 },
        { "nombre": "Suc. Benito Juárez", "cantidad": 0 },
        { "nombre": "Suc. Gustavo Baz", "cantidad": 0 },
        { "nombre": "Suc. Naucalpan", "cantidad": 0 },
        { "nombre": "Suc. Toluca", "cantidad": 0 },
        { "nombre": "Suc. Querétaro", "cantidad": 0 },
        { "nombre": "Suc. Vallejo", "cantidad": 0 },
        { "nombre": "Suc. Puebla", "cantidad": 0 }
      ]};
    }

    // Actualizar solo los cambios que vienen
    if(cambios) {
      data.sucursales.forEach(s => {
        if(cambios[s.nombre] !== undefined) s.cantidad = Number(cambios[s.nombre]);
      });
    }

    // Guardar en Shopify
    const save = await gql(`
      mutation ($mf: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $mf) {
          userErrors { field message }
        }
      }
    `, {
      mf: [{
        ownerId: product.id,
        namespace: "custom",
        key: "sucursales",
        type: "json",
        value: JSON.stringify(data)
      }]
    });

    const errors = save?.data?.metafieldsSet?.userErrors;
    if(errors?.length) return res.status(400).json({ ok:false, error: errors[0].message });

    return res.json({ ok:true, sucursales: data.sucursales });
  } catch(err) {
    console.error(err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}
