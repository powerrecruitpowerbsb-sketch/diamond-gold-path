CREATE OR REPLACE FUNCTION public.audit_row_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _old jsonb;
  _new jsonb;
  _key text;
  _rec_id uuid;
  _o text;
  _n text;
  _numeric_equal boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW);
    _rec_id := NULLIF(_new->>'id', '')::uuid;
    INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
    VALUES (_actor, TG_TABLE_NAME, _rec_id, NULL, NULL, _new::text, 'create');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD);
    _rec_id := NULLIF(_old->>'id', '')::uuid;
    INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
    VALUES (_actor, TG_TABLE_NAME, _rec_id, NULL, _old::text, NULL, 'update');
    RETURN OLD;
  ELSE
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _rec_id := NULLIF(_new->>'id', '')::uuid;
    FOR _key IN SELECT jsonb_object_keys(_new) LOOP
      IF _key IN ('updated_at') THEN CONTINUE; END IF;
      _o := _old->>_key;
      _n := _new->>_key;
      IF _o IS DISTINCT FROM _n THEN
        _numeric_equal := false;
        IF _o IS NOT NULL AND _n IS NOT NULL THEN
          BEGIN
            _numeric_equal := (_o::numeric = _n::numeric);
          EXCEPTION WHEN others THEN
            _numeric_equal := false;
          END;
        END IF;
        IF NOT _numeric_equal THEN
          INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
          VALUES (_actor, TG_TABLE_NAME, _rec_id, _key, _o, _n, 'update');
        END IF;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
END;
$function$;