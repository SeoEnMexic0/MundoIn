export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle, value } = req.body;
    
    // CONFIGURACIÓN FORZADA (El secreto del éxito)
    const host = 'mundo-jm-test.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN; // Configurado en Vercel
    const version = '2024-07';

    if (!token) return res.status(500).json({ ok: false, error: "Token no configurado" });

    // 1. Buscar producto por handle
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;
    const findQuery = `query($h:String!){productByHandle(handle:$h){id}}`;
    
    const findRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: findQuery, variables: { h: handle.toLowerCase().trim() } })
    });

    const findResult = await findRes.json();
    const gid = findResult?.data?.productByHandle?.id;

    if (!gid) return res.status(404).json({ ok: false, error: 'Producto no encontrado', handle });

    // 2. Actualizar Metafield
    const mutation = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ 
        ownerId: gid, 
        namespace: 'custom', 
        key: 'sucursales', 
        type: 'json', 
        value: typeof value === 'object' ? JSON.stringify(value) : value 
      }]
    };

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result = await response.json();
    const errors = result?.data?.metafieldsSet?.userErrors || [];

    if (errors.length > 0) return res.status(422).json({ ok: false, error: errors[0].message });

    return res.status(200).json({ ok: true, gid });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
