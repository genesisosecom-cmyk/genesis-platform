-- matias recibe todos los leads (calificados y no calificados), como reemplazo de Rebecca.
update public.sales_reps set sdr_segment = 'todos' where name = 'matias';
