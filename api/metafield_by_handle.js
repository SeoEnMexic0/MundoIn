export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle, value } = req.body;
    const host = 'mundo-jm-test.myshopify.com';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;
    
    // Paso 1: Buscar GID por Handle
    const findQuery = `query($h:String!){productByHandle(handle:$h){id}}`;
    const findRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: findQuery, variables: { h: handle.toLowerCase().trim() } })
    });

    const findResult = await findRes.json();
    const gid = findResult?.data?.productByHandle?.id;

    if (!gid) return res.status(404).json({ ok: false, error: 'Handle no encontrado' });

    // Paso 2: Actualizar Metafield
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
    return res.status(200).json({ ok: true, gid });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
