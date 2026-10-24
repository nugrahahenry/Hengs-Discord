# Setup preview assets

`twemoji/`: Twemoji 72x72 PNG graphics, copyright Twitter, Inc and other contributors, from
https://github.com/jdecked/twemoji (v15.1.0), licensed under CC-BY 4.0
(https://creativecommons.org/licenses/by/4.0/). Only the emoji used in the Hengs home server's channel names and in
the setup channel catalog are bundled. The VM has no emoji font, so `/admin setup` draws these images in its
sidebar preview.

`fonts/`: DejaVu Sans and DejaVu Sans Bold 2.37 (npm `dejavu-fonts-ttf@2.37.3`), Bitstream Vera and Arev licences
in `fonts/DEJAVU-LICENSE.txt`. They draw symbols that Barlow lacks (box drawing such as `╰┈─═`, arrows such as `➤`,
modifier letters such as `ˌˈ`) in the theme previews.
