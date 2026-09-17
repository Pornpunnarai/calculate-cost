-- update/delete ต้องเป็น security definer เพราะ rebuild_stock_purchases
-- ถูก revoke จาก anon แล้ว ถ้ายังเป็น invoker จะได้ permission denied
alter function update_stock_purchase(uuid, date, numeric, numeric, numeric)
  security definer;
alter function delete_stock_purchase(uuid)
  security definer;
