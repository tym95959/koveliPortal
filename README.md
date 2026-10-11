# Koveli staff portal (new app)

Sign-in, dashboard, sick leave and FRL, annual leave, duty change, roster, roster editor and admin,
with one shared look. Everything staff see is in this folder; nothing from the old app is needed.

## What is in the folder

| Path | What it is |
|---|---|
| `index.html` | Sign-in and dashboard |
| `leave.html`, `annual.html`, `duty.html` | Sick leave / FRL, annual leave, duty change |
| `roster.html` | Roster for everyone (by staff or by duty time) |
| `roster-editor.html` | Roster builder for Supervisors and Admin |
| `admin.html` | Staff, messages, email lists, set-up check (Admin only) |
| `security.html` | Change your own PIN or pattern |
| `css/app.css`, `js/core.js` | Shared look and shared script |
| `js/firebase-config.js` | **You edit this**: your Firebase web config |
| `api/` | Server code that Vercel runs (sign-in, codes, notifications, email) |
| `firestore.rules` | Database rules to paste into Firebase |
| `sw.js`, `manifest.json`, `icons/` | Installable app and background alerts |

## Set-up, in this order

### 1. Firebase
1. Create a project at console.firebase.google.com (or open the one you already use).
2. **Firestore Database** > Create database > Production mode.
3. **Authentication** > Get started. You do not need to switch on any sign-in provider.
4. **Firestore Database > Rules**: delete what is there, paste all of `firestore.rules`, Publish.
5. **Project settings (gear) > General > Your apps**: add a Web app if there is none, copy its config
   into `js/firebase-config.js`.
6. **Project settings > Cloud Messaging > Web Push certificates**: Generate key pair, copy the key into
   `KOVELI_VAPID_KEY` in `js/firebase-config.js`. (Only needed for alerts in a browser.)
7. **Project settings > Service accounts > Generate new private key**. A `.json` file downloads.
   Keep it private. You paste its contents into Vercel in the next step.

### 2. Gmail (the account that sends the emails)
1. Sign in to that Google account > **Manage your Google Account > Security**.
2. Turn on **2-Step Verification** if it is off.
3. Search the account settings for **App passwords**, create one named "Koveli portal".
4. Google shows a 16-letter password once. Copy it for Vercel. It is not your normal Gmail password.

### 3. Vercel
1. Create a new project from this folder (import the Git repository, or drag the folder in).
   Framework preset: **Other**. No build command. Root directory: this folder.
2. **Settings > Environment Variables**, add for Production (and Preview if you use it):

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The whole contents of the `.json` key file from Firebase step 7 |
| `EMAIL_USER` | The Gmail address that sends emails |
| `EMAIL_PASS` | The 16-letter app password from Gmail step 4 |
| `EMAIL_FROM_NAME` | Optional. The sender name, for example `Koveli Staff Portal` |
| `SETUP_KEY` | Any long phrase you make up. Needed once, to create the first Admin |

3. **Redeploy** after adding or changing variables. They only apply to new deployments.

### 4. First run
1. Open `https://your-site/api/health`. Every line should be `true` and `problem` should be `null`.
2. Open the site. With an empty database it shows **First-time set-up**: enter the `SETUP_KEY`,
   your name, staff number and a PIN. You are now the first Admin.
3. **Admin > Staff**: add everyone, with a PIN each. They can change it and add a pattern later.
4. **Admin > Emails and alerts**: enter who receives each kind of email, then send a test email.
5. **Menu > Turn on alerts on this device**, then **Admin > Emails and alerts > Send a test alert**.
6. **Roster editor**: build the roster and press Upload to Firebase. Staff see it on Roster.
7. When all is working you can delete `SETUP_KEY` from Vercel.

## If something does not work
- **"No one matches that" on the sign-in page, but you have staff**: the key in Vercel is for a different
  Firebase project than `js/firebase-config.js`. Admin > Set-up check and `/api/health` show both names.
- **Sign-in says the service is not working**: Authentication is not started in Firebase (step 1.3),
  or `FIREBASE_SERVICE_ACCOUNT_JSON` is missing or cut off.
- **"You are not allowed to do that"**: the rules were not published, or that person's role is wrong
  in Admin > Staff.
- **Emails are not sent**: Admin > Emails and alerts > Send test email shows the reason. The usual one
  is using the normal Gmail password instead of an app password.

## Using your existing database
The app uses the same collection names as before, so pointing it at the old project works:
- Existing staff can sign in with their old PIN or pattern. The first time they do, the code is moved
  into protected storage and the readable copy is deleted.
- Leave balances are now worked out, not stored: allowance (set per person in Admin > Staff) minus the
  leave reported this year. The old `staffBalances` numbers are not used.
- Once the new rules are published, the old pages stop working, because they do not sign in.

## Phone app (Capacitor)
Copy your existing `native-push.bundle.js` into `js/`. If the phone app bundles the web files inside it,
rebuild it with this folder; if it loads the website, nothing else is needed.
