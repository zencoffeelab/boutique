update content_page_translations
set blocks = (
  select jsonb_agg(
    case when block ->> 'type' = 'homeStatement' then jsonb_set(
      block,
      '{content,text}',
      to_jsonb($text$Le café est un voyage. Notre torréfaction en est le plus fidèle guide.
Chaque tasse est une invitation au départ, une origine à découvrir, une histoire à *partager*.$text$::text),
      true
    ) else block end
    order by position
  )
  from jsonb_array_elements(blocks) with ordinality as entries(block, position)
)
where locale = 'fr-FR'
  and exists (select 1 from content_pages where id = content_page_translations.page_id and page_key = 'accueil')
  and exists (select 1 from jsonb_array_elements(blocks) as entry where entry ->> 'type' = 'homeStatement');

update content_page_translations
set blocks = (
  select jsonb_agg(
    case when block ->> 'type' = 'homeStatement' then jsonb_set(
      block,
      '{content,text}',
      to_jsonb($text$Coffee is a journey. Our roast is its most faithful guide.
Every cup is an invitation to set off, an origin to discover, a story to *share*.$text$::text),
      true
    ) else block end
    order by position
  )
  from jsonb_array_elements(blocks) with ordinality as entries(block, position)
)
where locale = 'en-GB'
  and exists (select 1 from content_pages where id = content_page_translations.page_id and page_key = 'accueil')
  and exists (select 1 from jsonb_array_elements(blocks) as entry where entry ->> 'type' = 'homeStatement');
