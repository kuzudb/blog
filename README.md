# Kuzu Blog

Code for Kuzu's blog site, built with [Astro](https://astro.build/), Tailwind CSS, and TypeScript.
The site is built on top of the [EV0](https://github.com/gndx/ev0-astro-theme) OSS theme.

## 🚀 Getting Started

Clone this repository to your local machine using Git.

| Command           | Action                                             |
| :---------------- | :------------------------------------------------- |
| `npm install`     | Installs dependencies                              |
| `npm start`       | Builds & runs local dev server at `localhost:4321` |
| `npm run dev`     | Starts local dev server at `localhost:4321`        |
| `npm run build`   | Build your production site to `./dist/`            |
| `npm run preview` | Preview your build locally, before deploying       |

* Edit the `.astro` files in the `src/pages` directory to add blog, category, tag and other information.
* The blog layout can be modified from the `src/layouts` directory.
* Global CSS is located in the `src/styles` directory.

> [!NOTE]
> For any URL-related changes such as custom slugs or internal navigation between pages, make
> sure to run `npm run build` first, or simply run `npm start` to watch the local directory for such
> changes and to build the site before preview.

## 📝 Configuration Blog

To configure the blog, edit the `src/config/config.json` file. This file contains the following options:

```scheme
{
  "site": {
    "title": "Blog - Kuzu",
    "base_url": "kuzudb.github.io/blog",
    "base_path": "/",
    "favicon": "/favicon.ico",
    "logoLight": "/logoLight.png",
    "logoDark": "/logoDark.png",
    "lang": "en",
    "description": "Kuzu is a highly scalable, extremely fast, easy-to-use embeddable graph database",
    "pageSize": 6
  },
  "features": {
    "youtube": false,
    "dark_mode": true
  },
  "metadata": {
    "meta_author": "Kùzu Inc.",
    "meta_description": "Kuzu is a highly scalable, extremely fast, easy-to-use embeddable graph database"
  },
  "blog_description": {
    "heading": "Welcome to the Kuzu blog",
    "bio": "Kuzu is a highly scalable, extremely fast, easy-to-use embeddable graph database."
  },
}
```

The menu is configured in the `src/config/menu.json` file. This file contains the following options:

```scheme
[
  {
    "name": "Home",
    "url": "/"
  },
  {
    "name": "Tags",
    "url": "/tags"
  },
  {
    "name": "Categories",
    "url": "/categories"
  }
]
```

Social networks are configured in the `src/config/social.json` file. This file contains the following options:

```scheme
{
    name: "x",
    url: "https://x.com/kuzudb",
    svg: "...."
}
```

## 🎥 YouTube Integration

To integrate your YouTube channel, you need to create a new file called `.env` in the root directory of your project. Then add the `CHANNEL_ID` and `API_KEY` to get the latest videos from your YouTube channel in `src/config/youtube.json`.

```scheme
npm run youtube
```

Your YouTube API is not used in production.

Requires an API KEY for YouTube API V3 - [Google Console](https://console.cloud.google.com/)

You can disable the youtube integration by modifying the `src/config/config.json`.

```json
  "features": {
    "youtube": false
  },
```

## 📝 Adding New Posts

* Add conventional markdown files (`.md`) to the `src/content/post` directory
  * The file name should be in the format `YYYY-MM-DD-title.md` to retain the display order
* Images can be added to the `/public/blog/img/title` directory and referenced in the markdown files via relative paths
  * For an image in `/public/blog/img/title` directory, it can be referenced in the blog using the following path:
  * `![](/blog/img/title/image.png)`

## 📂 Project Structure

```
/
├── public/
│   └── favicons/
│   └── fonts/
│   └── blog-placeholder.jpg
│   └── favicon.png
│   └── humans.txt
├── scripts/
│   └── youtube.cjs
├── src/
│   ├── components/
│   ├── config/
│   ├── content/
│   ├── layouts/
│   └── pages/
│   └── styles/
│   └── env.d.ts
└── package.json
└── astro.config.mjs
└── tailwind.config.js
└── tsconfig.json
└── .gitignore
```
