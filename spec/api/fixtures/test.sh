#!/bin/zsh

curl -v -F caption=test -F width=8192 -F height=4096 -F thumbLat=30 -F thumbLng=90 -F locationName=Home -F locationLat=25 -F locationLng=121 -F thumbnail=@1_thumb.jpg -F "image=@1.jpg.zip;type=application/zip" http://localhost:3000/api/posts/panophoto?access_token=5Fo9qFv6J0ga3w51GFSPGIZ9hNiyZ4tRq0asqNJU27l7E9K0yPMUPCoDQ0UjRHie
