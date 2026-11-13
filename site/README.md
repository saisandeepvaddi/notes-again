# Notes Again website

Static public site for notesagain.com: plain HTML and CSS, one small script (`download.js`) that highlights the visitor's operating system on the download page. No build step, no external requests.

## Preview

```sh
python3 -m http.server -d site 8400
```

Open <http://localhost:8400>.

## Deploy to Cloudflare Pages

Create a Pages project from this repository with these settings:

- Build command: none
- Build output directory: `site`
- Custom domain: `notesagain.com`

Links are root-relative, so serve the site from the domain root.
