-- Elements with their linked footnotes, for context assembly.
create or replace function imac.get_elements_with_footnotes (p_element_ids uuid[])
returns table (element jsonb, footnotes jsonb)
language sql stable
set search_path = imac, extensions
as $$
  select to_jsonb(e) - 'fidelity',
         coalesce(jsonb_agg(jsonb_build_object('marker', l.marker, 'text', f.text, 'id', f.id, 'page', f.page_number))
                  filter (where f.id is not null), '[]'::jsonb)
  from imac.elements e
  left join imac.footnote_links l on l.element_id = e.id
  left join imac.elements f on f.id = l.footnote_id
  where e.id = any (p_element_ids)
  group by e.id;
$$;

-- Which elements reference a footnote (for footnote hits: footnote + its referrer).
create or replace function imac.footnote_referrers (p_footnote_ids uuid[])
returns table (footnote_id uuid, element_id uuid)
language sql stable
set search_path = imac, extensions
as $$
  select l.footnote_id, l.element_id from imac.footnote_links l where l.footnote_id = any (p_footnote_ids);
$$;
