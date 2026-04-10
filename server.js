const express = require("express");
const app = express();
app.use(express.json());

const FROM_DOMAIN = "outreach.abbella.app";

// Health check
app.get("/health", (req, res) => res.send("OK"));

// MCP discovery
app.get("/mcp", (req, res) => {
  res.json({
    schema_version: "v1",
    name: "resend-mcp",
    description: "Send emails via Resend for Abbella Group",
    tools: [
      {
        name: "send_email",
        description: "Send a single email via Resend from outreach.abbella.app",
        input_schema: {
          type: "object",
          required: ["to", "subject", "body"],
          properties: {
            to:           { type: "string", description: "Recipient email(s), comma-separated" },
            subject:      { type: "string", description: "Email subject line" },
            body:         { type: "string", description: "Email body — HTML supported" },
            from_name:    { type: "string", description: "Sender name. Default: Abbella Group" },
            from_address: { type: "string", description: "Prefix before @outreach.abbella.app. Default: hello" },
            reply_to:     { type: "string", description: "Reply-to address" },
            cc:           { type: "string", description: "CC recipients, comma-separated" },
            bcc:          { type: "string", description: "BCC recipients, comma-separated" }
          }
        }
      },
      {
        name: "send_bulk_emails",
        description: "Send same email to multiple recipients individually",
        input_schema: {
          type: "object",
          required: ["recipients", "subject", "body"],
          properties: {
            recipients:   { type: "array", items: { type: "string" }, description: "Array of email addresses" },
            subject:      { type: "string", description: "Email subject" },
            body:         { type: "string", description: "Email body HTML" },
            from_name:    { type: "string", description: "Sender name" },
            from_address: { type: "string", description: "Address prefix" },
            reply_to:     { type: "string", description: "Reply-to address" }
          }
        }
      },
      {
        name: "get_email_status",
        description: "Check delivery status of a sent email by Resend ID",
        input_schema: {
          type: "object",
          required: ["email_id"],
          properties: {
            email_id: { type: "string", description: "Resend email ID" }
          }
        }
      },
      {
        name: "list_domains",
        description: "List all verified Resend sending domains",
        input_schema: { type: "object", properties: {} }
      }
    ]
  });
});

// MCP tool execution
app.post("/mcp", async (req, res) => {
  const { tool, input = {} } = req.body;
  const apiKey = process.env.RESEND_API_KEY;

  async function resend(path, method = "GET", body = null) {
    const opts = {
      method,
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`https://api.resend.com${path}`, opts);
    return r.json();
  }

  try {
    if (tool === "send_email") {
      const { to, subject, body, from_name = "Abbella Group", from_address = "hello", reply_to, cc, bcc } = input;
      const payload = {
        from: `${from_name} <${from_address}@${FROM_DOMAIN}>`,
        to: to.split(",").map(s => s.trim()),
        subject, html: body
      };
      if (reply_to) payload.reply_to = reply_to;
      if (cc) payload.cc = cc.split(",").map(s => s.trim());
      if (bcc) payload.bcc = bcc.split(",").map(s => s.trim());
      const data = await resend("/emails", "POST", payload);
      return res.json(data.statusCode >= 400 ? { error: data.message } : { result: `Email sent. ID: ${data.id}`, email_id: data.id });
    }

    if (tool === "send_bulk_emails") {
      const { recipients, subject, body, from_name = "Abbella Group", from_address = "hello", reply_to } = input;
      const results = [];
      for (const to of recipients) {
        const payload = { from: `${from_name} <${from_address}@${FROM_DOMAIN}>`, to: [to.trim()], subject, html: body };
        if (reply_to) payload.reply_to = reply_to;
        const data = await resend("/emails", "POST", payload);
        results.push({ to, success: !data.statusCode || data.statusCode < 400, id: data.id });
      }
      return res.json({ result: `Sent: ${results.filter(r=>r.success).length}, Failed: ${results.filter(r=>!r.success).length}`, details: results });
    }

    if (tool === "get_email_status") {
      const data = await resend(`/emails/${input.email_id}`);
      return res.json(data.statusCode >= 400 ? { error: data.message } : { result: data });
    }

    if (tool === "list_domains") {
      const data = await resend("/domains");
      return res.json(data.statusCode >= 400 ? { error: data.message } : { result: data.data });
    }

    return res.status(400).json({ error: `Unknown tool: ${tool}` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Resend MCP running on port ${PORT}`));
