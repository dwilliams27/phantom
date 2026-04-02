(() => {
"use strict";

const url = document.URL;
const title = document.title;

const hasLoginForm = !!(
  document.querySelector('input[type="password"]') ||
  document.querySelector('form[action*="login"], form[action*="signin"], form[action*="auth"]') ||
  document.body?.innerText?.match(/\b(sign\s*in|log\s*in|enter your password)\b/i)
);

const hasCaptcha = !!(
  document.querySelector('.g-recaptcha, [data-sitekey], #recaptcha, .h-captcha') ||
  document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"]') ||
  document.querySelector('#cf-turnstile, .cf-turnstile, [data-turnstile-sitekey]')
);

const bodyText = document.body?.innerText?.substring(0, 5000) || "";
const hasError = !!(
  bodyText.match(/\b(403|429|500|502|503)\b.*\b(forbidden|too many|error|unavailable)\b/i) ||
  bodyText.match(/\b(access denied|rate limit|temporarily unavailable|please try again later)\b/i) ||
  document.title.match(/\b(error|denied|blocked|unavailable)\b/i)
);

return { url, title, hasLoginForm, hasCaptcha, hasError };

})();
