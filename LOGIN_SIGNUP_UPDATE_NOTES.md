# SAFI SALI COMPANIES — Login & Sign Up Update

## Updated files
- `Frontend/src/components/auth/LoginPage.tsx` — responsive Company Login and Company Sign Up screens based on the supplied references, with English/Somali copy.
- `Frontend/src/index.css` — responsive authentication styling and readable form controls.
- `Frontend/src/components/brand/Logo.tsx` — uses the actual Safi Sali logo extracted from the supplied reference.
- `Frontend/src/context/AppContext.tsx` — keeps the document language in sync with the selected language.
- `Frontend/src/services/api.ts` — persistent Remember Me token storage and session restoration.
- `Frontend/public/assets/company-login-portrait.jpg` and `company-signup-portrait.jpg` — clean portrait artwork cropped from the supplied references without embedded English copy.
- `Frontend/public/assets/safisali-companies-mark.png` and `safisali-companies-wordmark.png` — transparent logo and favicon assets extracted from the supplied reference.
- `Frontend/index.html` and `Frontend/src/utils/exports.ts` — use the replacement brand assets.

## Included behavior
- Company login using the existing `/api/auth/login` endpoint.
- Company registration using the existing `/api/auth/register` endpoint.
- Signup fields: Company Name, Company Email Address, Password, Confirm Password, Phone Number.
- Password confirmation and minimum 12-character validation.
- Show/hide password controls.
- Remember Me (session storage or persistent local storage).
- English/Somali language switching for all visible login and signup copy, including headings, descriptions, form labels, placeholders, controls, dialogs, and accessibility labels.
- Forgot Password assistance dialog.
- Back to Login / National Portal entry link.
- Responsive layout for mobile and desktop.
- The company logo is placed directly above the Login/Sign Up title, and the portrait remains clear on both screens.

## Run locally
1. Install the frontend dependencies: `cd Frontend && npm install`
2. Start the backend using the existing Backend setup and environment variables.
3. Start the frontend: `npm run dev`

The Forgot Password dialog currently directs users to their company administrator because this project does not include a configured email delivery/password-reset service. The National Portal action returns to the previous browser page when one exists; otherwise it falls back to `/`. The supplied project does not define a separate National Portal route.

TypeScript validation (`npm run lint`) and a production Vite build (`npm run build`) both completed successfully. The English and Somali login/signup screens were also checked at desktop and mobile viewport sizes.
