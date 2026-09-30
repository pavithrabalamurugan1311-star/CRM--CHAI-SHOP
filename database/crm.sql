CREATE DATABASE IF NOT EXISTS crm_chain_shop;
USE crm_chain_shop;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  role ENUM('admin','staff') NOT NULL
);
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address VARCHAR(255)
);
CREATE TABLE branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255),
  phone VARCHAR(20)
);
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 0
);
CREATE TABLE sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  branch_id INT NOT NULL,
  user_id INT NOT NULL,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE loyalty_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  sale_id INT NULL,
  points INT NOT NULL,            -- positive = earned, negative = redeemed
  type ENUM('earned','redeemed') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

-- Sample data
INSERT INTO users (name, username, password, role) VALUES
 ('Admin User','admin','admin123','admin'),
 ('Staff User','staff','staff123','staff');
INSERT INTO branches (name, address, phone) VALUES
 ('Main Branch','12 Market Road, Chennai','9000000001'),
 ('City Branch','45 Anna Salai, Chennai','9000000002');
INSERT INTO products (name, price, quantity) VALUES
 ('Notebook',50,100),('Pen Pack',120,8),('School Bag',850,20),('Water Bottle',300,5);
INSERT INTO customers (name, phone, email, address) VALUES
 ('Ravi Kumar','9111111111','ravi@example.com','T Nagar, Chennai'),
 ('Priya S','9222222222','priya@example.com','Adyar, Chennai');
