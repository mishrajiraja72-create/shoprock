/* ===== SHOPROCK patch v2 (ye LAST patch hai) =====
   Apps Script ke code ke BILKUL NEECHE paste karo. Phir:
   1) Ctrl+S  2) initializeDatabase chuno -> Run (ek baar)
   3) Deploy -> Manage deployments -> pencil -> New version -> Deploy
   Iske baad website ka look/content sab dashboard ke "Website Studio" se badlega. */
DEFAULT_SETTINGS.hero_image = '';
DEFAULT_SETTINGS.logo_url = '';
DEFAULT_SETTINGS.wa_greeting = 'Hi! I need help choosing a gift.';
DEFAULT_SETTINGS.site_json = '{}';
function publicConfig_(){
  var g=getSetting_;
  return {store_name:g('store_name')||'SHOPROCK',tagline:g('tagline'),announcement:g('announcement'),whatsapp_number:g('whatsapp_number'),
    support_email:g('support_email'),instagram_url:g('instagram_url'),support_contact:g('support_contact'),checkout_mode:g('checkout_mode'),
    hero_title:g('hero_title'),hero_text:g('hero_text'),story_title:g('story_title'),story_text:g('story_text'),occasions:g('occasions'),
    faq:parseJson_(g('faq_json'),[]),free_shipping_above:Number(g('free_shipping_above'))||0,ga_id:g('ga_id'),
    hero_image:g('hero_image'),logo_url:g('logo_url'),wa_greeting:g('wa_greeting'),site:parseJson_(g('site_json'),{})};
}
