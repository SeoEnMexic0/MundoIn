export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { handle, value } = req.body;
    
    // --- CORRECCIÓN DE DOMINIO ---
    // Forzamos el host interno para que Shopify no rechace la conexión
    const host = 'mundo-jm-test.myshopify.com'; 
    const version = '2024-07';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    // Validación básica
    if (!token || !handle || !value) {
      return res.status(400).json({ 
        ok: false, 
        error: `Faltan parámetros. Token: ${token ? 'OK' : 'FALTA'}, Handle: ${handle || 'FALTA'}` 
      });
    }

    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;

    // 1. Buscar producto por handle (ej: cama-luton)
    const findQuery = `query($h:String!){productByHandle(handle:$h){id}}`;
    const findRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: findQuery, variables: { h: handle.toLowerCase().trim() } })
    });

    const findResult = await findRes.json();
    
    // Manejo de error si la respuesta de Shopify no es lo que esperamos
    if (findResult.errors) {
      return res.status(500).json({ ok: false, error: 'Error en consulta Shopify', detalles: findResult.errors });
    }

    const gid = findResult?.data?.productByHandle?.id;

    if (!gid) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado en Shopify', handle });
    }

    // 2. Actualizar o crear el metafield
    const query = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ 
        ownerId: gid, 
        namespace: 'custom', 
        key: 'sucursales', 
        type: 'json', 
        value: valueStr 
      }]
    };

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();
    const errors = result?.data?.metafieldsSet?.userErrors || [];

    if (errors.length > 0) {
      return res.status(422).json({ ok: false, error: 'Shopify rechazó los datos', detalles: errors });
    }

    // ÉXITO
    res.status(200).json({ ok: true, gid, handle });

  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error interno del servidor: ' + error.message });
  }
}
