-- Todos los leads calificados nuevos van a Felipe Molina: matias recibe solo los no calificados.
update public.sales_reps set sdr_segment = 'no_calificados' where name = 'matias';
