## for reference
## https://docs.postgrest.org/en/v12/references/api/tables_views.html#get-and-head

## login, get a token and export it to $TOKEN
curl "http://localhost:3000/rpc/login" -X POST -H "Content-Type: application/json" -d '{ "email": "amy@hicox.com", "pass": "s053kr3t!" }'

## create a row
curl "http://localhost:3000/nthree_albums" -X POST \
-H "Content-Type: application/json" \
-H "Content-Profile: mezo" \
-H "Authorization: Bearer $TOKEN" \
-d '{"album_name":"Let it Be","artist":"The Beatles","label":"Apple","submitter":"2","last_modified_by":"2"}';

## list all in form
curl "http://localhost:3000/nthree_albums" -H "Content-Type: application/json" -H "Content-Profile: mezo" -H "Authorization: Bearer $TOKEN"

## read a specific row
curl "http://localhost:3000/nthree_albums?id=eq.1" -H "Content-Type: application/json" -H "Content-Profile: mezo" -H "Authorization: Bearer $TOKEN"

## get all rows modified since a given date
curl "http://localhost:3000/nthree_albums?modified_date=gt.2025-01-01T00:00:00.000000" \
-H "Content-Type: application/json" \
-H "Content-Profile: mezo" \
-H "Authorization: Bearer $TOKEN"

## modify a row
curl "http://localhost:3000/nthree_albums?id=eq.1" -X PATCH \
-H "Content-Type: application/json" \
-H "Content-Profile: mezo" \
-H "Authorization: Bearer $TOKEN" \
-d '{ "label": "RCA" }'

## delete a row
curl "http://localhost:3000/nthree_albums?id=eq.1" -X DELETE \
-H "Content-Type: application/json" \
-H "Content-Profile: mezo" \
-H "Authorization: Bearer $TOKEN"

## upsert -- like a merge I guess?
curl "http://localhost:3000/nthree_albums" -X POST \
-H "Content-Type: application/json" \
-H "Content-Profile: mezo" \
-H "Prefer: resolution=merge-duplicates" \
-H "Authorization: Bearer $TOKEN" \
-d '[{"album_name":"Let it Be","artist":"The Beatles","label":"Apple"}, {"album_name":"Licensed to Ill","artist":"Beastie Boys","label":"Columbia"}]'


## 1/2/24 @ 2350
## this gets us everything we'd need to drive a syncWorker
## except dealing with binary data aka "attachments"
## which I mean lets face it ... other than for pictures, why?
