-- Banco separado para testes de integração: nunca rodamos testes contra os dados de desenvolvimento.
-- Este script só executa na primeira criação do volume. Para recriar: `docker compose down -v`.
CREATE DATABASE igreja_test;
