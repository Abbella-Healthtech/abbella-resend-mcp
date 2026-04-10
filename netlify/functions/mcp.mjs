const FROM_DOMAIN = "outreach.abbella.app";

async function resendRequest(path, method = "GET", body = null) {
  const apiKey = Netlify.env.get("RESEND_API_KEY");
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.resend.com${path}`, opts);
  return res.json();
}

const TOOLS = [
  {
    name: "send_email",
    description: "Send a single email via Resend from outreach.abbella.app",
    inputSchema: {
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to:           { type: "string",  description: "Recipient email address(es), comma-separated" },
        subject:      { type: "string",  description: "Email subject line" },
        body:         { type: "string",  description: "Email body — HTML is supported" },
        from_name:    { type: "string",  description: "Sender display name. Default: Abbella Group" },
        from_address: { type: "string",  description: "Prefix before @outreach.abbella.app. Default: hello" },
        reply_to:     { type: "string",  description: "Reply-to address" },
        cc:           { type: "string",  description: "CC recipients, comma-separated" },
        bcc:          { type: "string",  description: "BCC recipients, comma-separated" }
      }
    }
  },
  {
    name: "send_bulk_emails",
    description: "Send the same email individually to multiple recipients (outreach campaigns)",
    inputSchema: {
      type: "object",
      required: ["recipients", "subject", "body"],
      properties: {
        recipients:   { type: "array", items: { type: "string" }, description: "Array of recipient email addresses" },
        subject:      { type: "string", description: "Email subject line" },
        body:         { type: "string", description: "Email body — HTML supported" },
        from_name:    { type: "string", description: "Sender display name. Default: Abbella Group" },
        from_address: { type: "string", description: "Prefix before @outreach.abbella.app. Default: hello" },
        reply_to:     { type: "string", description: "Reply-to address" }
      }
    }
  },
  {
    name: "get_email_status",
    description: "Check delivery status of a sent email by Resend email ID",
    inputSchema: {
      type: "object",
      required: ["email_id"],
      properties: {
        email_id: { type: "string", description: "Resend email ID returned when email was sent" }
      }
    }
  },
  {
    name: "list_domains",
    description: "List all verified sending domains in the Resend account",
    inputSchema: { type: "object", properties: {} }
  }
];

async function handleTool(tool, input) {
  if (tool === "send_email") {
    const {
      to, subject, body,
      from_name = "Abbella Group",
      from_address = "hello",
      reply_to, cc, bcc
    } = input;
    const payload = {
      from: `${from_name} <${from_address}@${FROM_DOMAIN}>`,
      to: to.split(",").map(s => s.trim()),
      subject,
      html: body
    };
    if (reply_to) payload.reply_to = reply_to;
    if (cc)       payload.cc  = cc.split(",").map(s => s.trim());
    if (bcc)      payload.bcc = bcc.split(",").map(s => s.trim());
    const data = await resendRequest("/emails", "POST", payload);
    if (data.statusCode >= 400) return { error: data.message || "Send failed" };
    return { result: `Email sent. Resend ID: ${data.id}`, email_id: data.id };
  }

  if (tool === "send_bulk_emails") {
    const { recipients, subject, body, from_name = "Abbella Group", from_address = "hello", reply_to } = input;
    const results = [];
    for (const to of recipients) {
      const payload = { from: `${from_name} <${from_address}@${FROM_DOMAIN}>`, to: [to.trim()], subject, html: body };
      if (reply_to) payload.reply_to = reply_to;
      const data = await resendRequest("/emails", "POST", payload);
      results.push({ to, success: !data.statusCode || data.statusCode < 400, id: data.id, error: data.message });
    }
    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    return { result: `Bulk send complete. Sent: ${sent}, Failed: ${failed}`, details: results };
  }

  if (tool === "get_email_status") {
    const data = await resendRequest(`/emails/${input.email_id}`);
    if (data.statusCode >= 400) return { error: data.message };
    return { result: data };
  }

  if (tool === "list_domains") {
    const data = await resendRequest("/domains");
    if (data.statusCode >= 400) return { error: data.message };
    return { result: data.data.map(d => ({ name: d.name, status: d.status, region: d.region })) };
  }

  return { error: `Unknown tool: ${tool}` };
}

export default async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (req.method === "GET") {
    return new Response(JSON.stringify({
      name: "resend-mcp", version: "1.0.0",
      description: "Send and manage emails via Resend for Abbella Group (outreach.abbella.app)",
      tools: TOOLS
    }), { headers: corsHeaders });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }
    const { tool, input = {} } = body;
    if (!tool) return new Response(JSON.stringify({ error: "Missing tool name" }), { status: 400, headers: corsHeaders });
    const result = await handleTool(tool, input);
    return new Response(JSON.stringify(result), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
};

export const config = { path: "/mcp" };
