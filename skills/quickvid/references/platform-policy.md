# Platform rules for calls to action

Read this before writing a script's last line, an end card, a carousel's last slide or any caption. One video file usually
goes to several platforms, and they don't allow the same call to action.

## TikTok: no off-TikTok call to action (TikTok Shop "redirecting traffic")

TikTok Shop's redirecting-traffic rule covers every video and LIVE from a TikTok Shop creator account, not only videos with a
product link. A video is flagged when it prompts viewers to leave TikTok for the thing it promotes, in any form: spoken,
on-screen text, an emoji, the caption, or by pointing at the link in the bio. Free or paid makes no difference, and a model
on MakerWorld counts as a promoted product. Repeated flags lower the account's Creator Health Rating, and a low rating cuts
the account's reach.

Never on TikTok (in the voice-over, on screen, on a slide, or in the caption):

- "Link in bio", "link in the description", or an arrow at the profile link
- Naming where to get it: MakerWorld, Printables, Thingiverse, Amazon, Etsy, a website or a store, a username on another
  app, "search <name> on <site>"
- Get, grab, download, buy, order, shop, "check it out", "it's available on..." pointed at another site
- URLs, QR codes, discount codes, "DM me", contact details
- Showing how to download or buy on another site (a screen recording of the MakerWorld page, say)
- A `#makerworld`-style hashtag that names another platform

Fine on TikTok: asking viewers to follow, like, comment, save and share ("Follow for more prints"); showing the product and
what it does; naming the printer, the filament or the software as facts of how it was made ("printed on a Bambu Lab P1S"),
without telling people to go and get them. A product sold through TikTok Shop is linked with TikTok Shop's own product link,
never an outside affiliate link.

The account's profile link: TikTok counts links in the bio as a form of redirecting call to action too. Keeping an outside
store or model link in the TikTok bio is a risk while the account is a TikTok Shop creator; say so when it comes up, and
never point to it from a video or caption.

## Instagram, YouTube and the rest

Instagram Reels and YouTube Shorts allow an off-platform call to action ("It's on MakerWorld. Link in bio.", "search
<name> on MakerWorld"). Links still go only where they're clickable: the YouTube description, never an Instagram or TikTok
caption. Affiliate links carry their disclosure (the brand profile's "Sources and claims").

## So, for every video and carousel

- **A video with an off-TikTok call to action gets a TikTok cut.** Make the main video for Instagram and YouTube as usual,
  then make the TikTok file from it with `QV/scripts/tiktok_cut.py`: the same video up to the call-to-action line, ending on a
  follow card. Its name is `<slug>-tiktok` in the same `Final/` folder (a different name from the main render, so cleaning up
  after posting never removes it). In `publish.md`, the `## TikTok` section starts with `Video:` and the TikTok cut's path, and
  the hand-off tells the user to post that file on TikTok.
- **A video whose call to action is already a follow** ("Follow for more tech tips") needs no TikTok cut.
- **TikTok captions** say what the thing is and does, with keywords and hashtags, and end on an engagement ask (a question to
  answer in the comments, or "Follow for more"). Nothing from the "never" list above.
- **A carousel's TikTok slides** end on the brand's follow call to action, never "Free on MakerWorld: <name>".
- **Check before handing off:** read the TikTok file's last line, its end card and the TikTok caption against the "never"
  list. The Content Board app flags a piece whose TikTok caption, or whose script with no TikTok cut named, still has one.

## Sources

Checked 2026-11-25 in TikTok Shop Academy (US). Re-check when TikTok flags a video for a reason this page doesn't cover.

- Avoid Redirecting Traffic (updated 2026-06-22):
  https://seller-us.tiktok.com/university/essay?knowledge_id=4588077398099713&role=1&course_type=1
- 2026 Fall Edition TikTok Shop Creator and Content Policy Guide (updated 2026-10-30), "Misleading Behavior: Redirecting
  Traffic": https://seller-us.tiktok.com/university/essay?knowledge_id=7224606040442645&role=1&course_type=1
