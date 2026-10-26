ALTER TABLE "Organizacao" DROP CONSTRAINT "Organizacao_cnpj_formato_check";
ALTER TABLE "Organizacao" ADD CONSTRAINT "Organizacao_cnpj_formato_check"
  CHECK ("cnpj" ~ '^[A-Z0-9]{12}[0-9]{2}$');
