export default async function handler(req, res) {
  // Configuración de CORS para permitir que tu index.html hable con la API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, value } = req.body;
    
    // --- CONFIGURACIÓN DE TU TIENDA REAL ---
    const host = 'mundo-in.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    // Validaciones básicas
    if (!token) throw new Error("Token no configurado en las variables de entorno de Vercel");
    if (!product_id) throw new Error("Falta el product_id en la petición");

    // Construcción del ID global de Shopify (GID)
    const gid = `gid://shopify/Product/${product_id}`;
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;

    // Shopify requiere que el valor de un metacampo JSON se envíe como un String (texto)
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

    // Mutación GraphQL para insertar o actualizar metacampos
    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metafields: [{
        ownerId: gid,
        namespace: "custom", // Tu namespace confirmado
        key: "sucursales",   // Tu clave confirmada
        type: "json",        // Tipo de dato JSON
        value: stringValue
      }]
    };

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Shopify-Access-Token': token 
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result = await response.json();

    // Manejo de errores específicos de la API de Shopify
    if (result.errors) {
      return res.status(400).json({ ok: false, error: result.errors[0].message });
    }

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      const errorMsg = result.data.metafieldsSet.userErrors[0].message;
      return res.status(400).json({ ok: false, error: errorMsg });
    }

    // Si todo sale bien, devolvemos éxito
    return res.status(200).json({ ok: true, result });

  } catch (error) {
    console.error("Error en el servidor:", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
