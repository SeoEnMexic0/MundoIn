export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { variant_id, value } = req.body;

    if (!variant_id || !value) {
      return res.status(400).json({
        ok: false,
        error: 'variant_id y value son requeridos'
      });
    }

    const host = 'mundo-in.myshopify.com';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    const gid = `gid://shopify/ProductVariant/${variant_id.toString().trim()}`;
    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;

    const mutation = `
      mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            key
            namespace
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: gid,
          namespace: "custom",
          key: "sucursales",
          type: "json",
          value: JSON.stringify(value)
        }
      ]
    };

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({
        query: mutation,
        variables
      })
    });

    const result = await response.json();

    const errors = result?.data?.metafieldsSet?.userErrors;

    if (errors && errors.length > 0) {
      console.error('SHOPIFY ERROR:', errors);
      return res.status(400).json({
        ok: false,
        error: errors[0].message
      });
    }

    return res.status(200).json({
      ok: true,
      variant_id
    });

  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
