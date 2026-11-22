# ascend-assets

Shared masthead files for the ASCEND dashboards in this organization: `ascend-mast.js` (loads `ascend-mast.css`, the logo and the stats script from this same folder), plus the favicon and wordmark. Pages include it as `/ascend-assets/ascend-mast.js`.

`ascend-updated.js` adds the "Last updated" line. `ascend-mast.js` loads it by itself; a page without the shared masthead includes `/ascend-assets/ascend-updated.js` once at the end of `<body>`. The line shows the day the dashboard was last published (the page's Last-Modified time), unless the page states the day its data was last rebuilt (`window.ASCEND_UPDATED`, or `data-updated` on the script tag). Details are in the file's opening comment.
