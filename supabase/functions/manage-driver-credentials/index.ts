import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return jsonResponse(401, { error: "Authentication is required." });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(
      Deno.env.get("SUPABASE_SECRET_KEYS") || "{}",
    ) as Record<string, string>;
    const secretKey = secretKeys.default;
    if (!supabaseUrl || !secretKey) {
      throw new Error("Credential management is not configured on the server.");
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse(401, { error: "The session is invalid or expired." });
    }

    let body: {
      action?: unknown;
      businessId?: unknown;
      driverUserId?: unknown;
      name?: unknown;
      email?: unknown;
      password?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Request body must be valid JSON." });
    }

    const { businessId, driverUserId } = body;
    const action =
      body.action === undefined || body.action === "update"
        ? "update"
        : body.action;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (typeof businessId !== "string" || !["create", "update"].includes(String(action))) {
      return jsonResponse(400, {
        error: "A valid action and business are required.",
      });
    }
    if (
      action === "create" &&
      (!name || name.length > 100 || !email || !password)
    ) {
      return jsonResponse(400, {
        error: "A driver's name, email, and password are required.",
      });
    }
    if (
      action === "update" &&
      (typeof driverUserId !== "string" || (!email && !password))
    ) {
      return jsonResponse(400, {
        error: "A driver and new credential details are required.",
      });
    }
    if (password && password.length < 8) {
      return jsonResponse(400, {
        error: "New passwords must be at least 8 characters.",
      });
    }

    const { data: ownerMembership, error: ownerError } = await admin
      .from("business_memberships")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (ownerError) throw ownerError;
    if (ownerMembership?.role !== "owner") {
      return jsonResponse(403, { error: "Owner access is required." });
    }

    if (action === "create") {
      const { data: createdData, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: name },
        });
      if (createError) {
        return jsonResponse(400, { error: createError.message });
      }
      if (!createdData.user) {
        throw new Error("Supabase did not return the newly created user.");
      }

      const { error: membershipInsertError } = await admin
        .from("business_memberships")
        .insert({
          business_id: businessId,
          user_id: createdData.user.id,
          role: "delivery_driver",
        });
      if (membershipInsertError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(
          createdData.user.id,
        );
        if (cleanupError) {
          throw new Error(
            `Unable to add the driver membership: ${membershipInsertError.message}. Account cleanup failed: ${cleanupError.message}`,
          );
        }
        throw new Error(
          `Unable to add the driver membership: ${membershipInsertError.message}`,
        );
      }

      return jsonResponse(200, {
        success: true,
        created: { userId: createdData.user.id },
      });
    }

    const { data: driverMemberships, error: driverError } = await admin
      .from("business_memberships")
      .select("business_id,role")
      .eq("user_id", driverUserId);
    if (driverError) throw driverError;
    if (
      driverMemberships?.length !== 1 ||
      driverMemberships[0].business_id !== businessId ||
      driverMemberships[0].role !== "delivery_driver"
    ) {
      return jsonResponse(404, {
        error:
          "The selected delivery account must belong only to this business before its credentials can be managed here.",
      });
    }

    const updates: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email) {
      updates.email = email;
      updates.email_confirm = true;
    }
    if (password) updates.password = password;

    const { error: updateError } = await admin.auth.admin.updateUserById(
      driverUserId,
      updates,
    );
    if (updateError) {
      return jsonResponse(400, { error: updateError.message });
    }

    return jsonResponse(200, {
      success: true,
      updated: { email: Boolean(email), password: Boolean(password) },
    });
  } catch (error) {
    console.error("Driver credential update failed:", error);
    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update delivery credentials.",
    });
  }
});
