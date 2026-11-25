# Thumbnails and covers that earn the tap

Written for the posting-kit step of quickvid's short format (`short-format.md`, step 7), which the reel skill's formats
use. A thumbnail has about a second, at the size of a grid tile, to make someone tap. Design it on purpose, never as a
frame with the hook line typed over it. Research behind these rules: 2026-11-24 (sources at the end).

## Where a cover is seen

| Platform | Where the cover shows | What to upload |
|---|---|---|
| TikTok | The profile grid, search results, sound and hashtag pages. The For You feed autoplays the video instead. | 1080x1920. The grid crops it to roughly the centre (sources disagree between a square and 3:4), so design for the centre square. |
| Instagram | The profile grid (a 3:4 crop, the centre 1080x1440), the Reels tab and Explore. The feed autoplays. | 1080x1920, through "Edit cover" when posting. |
| YouTube Shorts | Search, the channel page, subscriptions and home. The Shorts feed autoplays. | The vertical cover, uploaded in YouTube Studio on a computer (custom Shorts thumbnails reached creators from July 2026; the account must be verified). A 16:9 thumbnail on a vertical video is replaced by an auto-generated 4:5 one, so never give a Short a wide thumbnail. |
| A long YouTube video | Everywhere it's listed. | 1280x720 (`--wide`). YouTube Studio's Test & Compare tries up to three thumbnails on a long video. |

In every feed that autoplays, **the first second is the thumbnail**: open the video on the payoff visual with the
cover's words on screen, so the feed and the grid agree.

## The rules

1. **One idea, one subject, big.** One focal thing fills at least half of the centre square. Zoom in on the one element
   that matters (the button, the result, the product); a whole screen of small interface reads as nothing at tile size.
2. **2 to 5 words, huge.** They aren't the title or the caption; they're the reason to tap:
   - the pain ("NO MORE / TAKING TURNS"),
   - the payoff ("TWO SCREENS / AT ONCE"),
   - a number ("3 SETTINGS / TO CHANGE"),
   - or a surprise ("IT WAS / HIDDEN HERE").
3. **Contrast.** White words with a heavy black outline, the second line on the brand's accent bar, a photo with its
   colour and contrast pushed. Never grey on grey, never thin type, never text over a busy area without its outline.
4. **Show the payoff.** The result, the finished thing, a before and after, a side by side. Promise what the video
   delivers, and show it.
5. **A face, or the next best thing.** A face with a clear expression draws the eye, when the brand shows faces (its
   profile's "On camera"). Otherwise: hands holding the product, the product close up, or an arrow or circle on the
   thing that matters.
6. **Honest.** The cover shows what the video gives. Anything not out yet carries a dated badge ("TEAMS · JAN 2027");
   a leak says it's a leak.
7. **The centre square.** Everything that matters sits between y 420 and 1500 of the 1080x1920 cover: that square
   survives every grid's crop. Above and below it is background only.
8. **One look per brand.** The same type, bar and accent on every cover, so the grid reads as one channel.

## How to make one

1. **Three concepts first.** Three different angles (payoff, pain, and curiosity or a number). For each: the image, the
   words (line 1 and line 2), and an optional badge or callout. Use the brand profile's voice: no hype words, no
   stacked exclamation marks.
2. **The image.** A frame from the video's payoff moment, a frame from its motion graphic, or a still composed for the
   cover when no single frame carries it (two results side by side, the product with its box). The subject must fill
   the centre square.
3. **Render each** with the thumbnail tool:

   ```
   uv run --no-project --with pillow python QV/scripts/thumbnail.py --photo <image or clip> --out-dir "<piece>/Final" \
       --name <slug>-a --words "<line 1>" --words2 "<line 2>" [--badge "<label>"] [--arrow X1,Y1,X2,Y2 | --circle X,Y,R] \
       [--focus X,Y] [--zoom 1.3] --accent <accent> [--wide]
   ```

   It writes `<slug>-a-cover.jpg` (the cover for TikTok, Instagram and YouTube Shorts) and `<slug>-a-grid-preview.jpg`
   in the piece's `.quickvid/`; `--wide` adds the 1280x720 thumbnail, for a long YouTube video only.
4. **The squint test.** Look at each grid preview: are the words readable at tile size, is the subject clear in one
   glance, is anything cut off in a crop? Fix it and render again (each render is a new version; nothing is overwritten).
5. **Show all three** side by side with a recommendation and why; the user picks. Put the chosen cover in `publish.md`'s
   `Covers:` line for TikTok, Instagram and YouTube.
6. **Match the opening.** The video's first frame shows the same words on the same image.
7. **Learn from it.** After posting, which cover went out and how the video did belongs in the brand profile's "What
   has worked" (the brand-profile skill's "add what's working").

A carousel's first slide is its cover: the same rules apply.

## Sources (read 2026-11-24)

- YouTube Help, custom thumbnails (Shorts thumbnails on a computer; 16:9 on vertical replaced by 4:5):
  https://support.google.com/youtube/answer/72431
- YouTube blog, thumbnail updates: https://blog.youtube/news-and-events/youtube-studio-custom-thumbnail-updates/
- Tubefilter, custom Shorts thumbnails (July 2026):
  https://www.tubefilter.com/2026/07/24/youtube-shorts-custom-thumbnails-neal-mohan-feature-update/
- vidIQ, thumbnail design tips and CTR: https://vidiq.com/blog/post/youtube-thumbnail-tips/ and
  https://vidiq.com/blog/post/youtube-custom-thumbnails-ctr/
- Influencer Marketing Hub, YouTube Test & Compare: https://influencermarketinghub.com/youtube-test-compare/
- Buffer, Instagram sizes (Reels cover, 3:4 grid): https://buffer.com/resources/instagram-image-size/
- Kapwing, Instagram's grid: https://www.kapwing.com/resources/instagrams-new-grid-layout-size-and-dimensions-2025/
- TokPortal and HeyOrca, TikTok cover size and grid crop: https://www.tokportal.com/learn/tiktok-cover-photo-size-strategy-ctr
  and https://www.heyorca.com/blog/tiktok-media-specs-best-practices-2026

Most of these are vendor guides whose crop figures disagree; the centre-square rule covers all of them. Check a cover
in each app's own preview before posting, and trust the brand's own results over any rule here.
