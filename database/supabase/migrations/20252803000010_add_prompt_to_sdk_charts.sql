alter table public.sdk_charts
  add column if not exists prompt text;

comment on column public.sdk_charts.prompt is 'Original prompt used to generate the chart';
