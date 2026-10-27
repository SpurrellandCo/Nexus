# MakerWorld upload form guide

This is MakerWorld's global site (`makerworld.com/en`) as of October 2026. If the page looks different, read it and adapt. Don't guess at hidden radio values or click unknown dialogs.

## Before you start

- **Cloudflare 502 on first load:** wait about 5 seconds and load the page again.
- **Cookie banner:** open Cookie Settings, then choose Reject All.
- **Signed in?** The user's avatar shows top right. If MakerWorld asks for a login, the user has to sign in. Never enter credentials.

## Entry

1. Click the green upload icon (top right), then **3D original model**.
2. "Do you have a Bambu Studio file (.3mf)?": choose **Yes**, then **Next Step**. The URL is `/en/my/models/publish?type=original`.

## Step 1: Upload

- **Bambu Studio File (Print Profile):** a file input that accepts `.3mf`. Upload the chosen 3MF and wait for its row to show a file size. If the row shows "0 byte" with a Retry button (seen after "Please refresh the page" toasts), don't click Replace File, because it opens a native picker. Find the `.3mf` file input again and upload the same file to it; the second upload worked.
- **Raw Model Files:** optional (STEP, STL, F3D and others). They help MakerWorld's cloud slicing for other printers. **Each uploaded file's row has an "Open Source" checkbox that MakerWorld ticks by default (October 2026), and while it's ticked anyone can download that raw file.** Untick it on every row unless the user wants the raw files public, then check the box shows empty. The same rows appear again at the top of the Model Information step, so check them there too.
- Click **Next Step**. This creates a draft at `/en/my/models/drafts/<id>/edit`.

## Step 2: Model Information (`/edit`)

| Field | How to fill it |
|---|---|
| Original / Remix / Share | Original |
| Laser & Cut model? | No |
| Model Covers | Two file inputs, "4:3 Cover" and "3:4 Cover". Each opens a crop dialog; click **Submit**. The 4:3 cover has failed silently before, so check its preview appears. If it doesn't, upload again and wait about 4 seconds before Submit. |
| Model Videos | Optional. Up to 30 s, mp4 or mov. |
| Real life photos | The "Add Photo" file input accepts several files at once. You need at least 3. Check the counter reads "(3 / 16)" or more. |
| Model Pictures | Optional renders. |
| Model Name | **50 characters at most.** The counter shows `50/50` at the limit. |
| Category | Type a keyword (for example "organizer") and pick from the dropdown (Tools › Organizers). |
| Tags | Type **one** tag, wait about 1 s, press Enter, wait about 1 s. Typing faster merges tags into one chip ("gridfinity bintool holder" instead of two tags). Remove a bad chip with its ×. |
| License | Under "Allow adaptations", the option "Yes, any derivative works must be published exclusively on MakerWorld and comply with SDFL-C" gives the Standard Digital File License – Community Use, with commercial use set to No. Joining the Exclusive Program replaces this with the **MakerWorld Exclusive License**. |
| Visibility | Public |
| Description | A CKEditor 5 editor; see "Rich-text editors" below. |
| Join the Exclusive Model Program | Turning the toggle on opens "Check Terms before Joining". Click **Agree & Join** only with the user's approval. A second dialog, "Change Your License", then asks to switch to the MakerWorld Exclusive License: click **Confirm**. Then pick **Exclusive Model** (permanent, larger bonus) or **14-Day Exclusive Launch Model**, and check that the License section now reads "MakerWorld Exclusive License". |
| Add Bill of Materials | A toggle for Maker's Supply items. Use it when the model needs hardware. |

The buttons along the bottom are **Previous**, **Save to draft** and **Add Print Profile**. Save to draft before moving on.

## Step 3: Print Profile (`/createPrintProfile`)

- **Print Profile Name:** filled in from the 3MF; up to 60 characters.
- **Print Profile Pictures:** MakerWorld picks one photo automatically. At least one real photo is required.
- **Print Profile Description:** the only CKEditor on this page.
- **Printer Compatibility Check:** every printer starts ticked. Untick any whose plate can't fit the part. The A1 mini is 180 × 180 mm. The A1, P1P, P1S, P2S and X1-series are 256 × 256 mm. The H2 series is bigger. For anything else, check the printer's spec.
- **"I've read Print Profile Guidelines"** and **Publish:** the user's decision. Leave them alone unless the user says otherwise.

## Rich-text editors (CKEditor 5)

Set the whole description in one go and keep the formatting:

```js
const ed = document.querySelector('.ck-editor__editable').ckeditorInstance;
ed.setData('<p>Intro…</p><h3>Holds</h3><ul><li>…</li></ul><p><a href="https://…">available on Amazon</a> (affiliate link)</p>');
```

Then make the page register the change: click at the end of the last line of text, type a character, wait about 1 s, press Backspace, and click outside the editor. Without this it shows a red "Please enter description" state. A space typed after jumping to the end with a shortcut wasn't enough (October 2026), so check that the red text is gone and that `getData()` still returns the full description. Use `<h3>` for section headings, `<ul>`/`<li>` for lists and `<a href>` for links. To change one phrase, use `getData()`, replace the text, then `setData()`, and confirm the replacement actually happened.

## Navigation traps

- **Wrong-page edits:** the page sometimes jumps from `/createPrintProfile` back to `/edit`, for example after a reload or a toggle change. Every script that writes to an editor must check `location.pathname` first and stop if it's the wrong page. Otherwise the print-profile text overwrites the main description.
- **"Please refresh the page and try again" toast:** saved fields survive a reload, but re-check the name, tags, covers, photos, description and the Exclusive toggle afterwards.
- **"Add Print Profile" that only scrolls:** click it again. If it still won't move on, look for a field flagged as invalid.
- **Shifting layout:** after a navigation the page often scrolls, and the mouse may end up over **Publish**. Never click at coordinates from an earlier screenshot. Find the element again, or take a fresh screenshot.
- **Exclusive toggle:** it can show as on after a reload even if the terms dialog was cancelled. Check its state and make it match what the user approved.
