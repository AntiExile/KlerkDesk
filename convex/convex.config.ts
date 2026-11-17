import { defineApp } from 'convex/server';
import { v } from 'convex/values';
import auth from '@convex-dev/auth/convex.config.js';
import authPassword from '@convex-dev/auth/components/password/convex.config.js';
import authUsername from '@convex-dev/auth/components/username/convex.config.js';
import authPasskey from '@convex-dev/auth/components/passkey/convex.config.js';

const app = defineApp({
  env: {
    PASSKEY_RP_ID: v.optional(v.string()),
    PASSKEY_ORIGIN: v.optional(v.string()),
    WHATSAPP_APP_SECRET: v.optional(v.string()),
    WHATSAPP_VERIFY_TOKEN: v.optional(v.string()),
    WHATSAPP_ACCESS_TOKEN: v.optional(v.string()),
    WHATSAPP_PHONE_NUMBER_ID: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
    KLERK_INTERNAL_SECRET: v.optional(v.string()),
  },
});

app.use(auth);
app.use(authPassword);
app.use(authUsername);
app.use(authPasskey);

export default app;
