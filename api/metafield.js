export default async function handler(req, res) {
  // Configuración de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, value } = req.body;
    
    // --- DOMINIO CORRECTO DE MUNDO IN ---
    const host = 'mundo-in.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    if (!token) throw new Error("Token no configurado en Vercel");
    if (!product_id) throw new Error("Falta el ID del producto");

    const gid = `gid://shopify/Product/${product_id}`;
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;

    // Convertimos el objeto a string JSON para Shopify
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [{
        ownerId: gid,
        namespace: "custom",
        key: "sucursales",
        type: "json",
        value: stringValue
      }]
    };

    // Usamos un tiempo límite (AbortController) para que no se quede colgado
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 segundos

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Shopify-Access-Token': token 
      },
      signal: controller.signal,
      body: JSON.stringify({ query: mutation, variables })
    });

    clearTimeout(timeout);
    const result = await response.json();

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      return res.status(400).json({ 
        ok: false, 
        error: result.data.metafieldsSet.userErrors[0].message 
      });
    }

    return res.status(200).json({ ok: true, result });

  } catch (error) {
    return res.status(500).json({ 
      ok: false, 
      error: error.name === 'AbortError' ? 'Tiempo de espera agotado (Shopify no responde)' : error.message 
    });
  }
}
