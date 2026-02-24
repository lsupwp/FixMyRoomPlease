CREATE DATABASE IF NOT EXISTS fixmyroom;
USE fixmyroom;


CREATE TABLE IF NOT EXISTS accounts (
    account_id INT PRIMARY KEY AUTO_INCREMENT,
    role ENUM('admin', 'tenant') NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS admin (
    account_id INT NOT NULL PRIMARY KEY,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

CREATE TABLE IF NOT EXISTS tenants (
    account_id INT NOT NULL PRIMARY KEY,
    room_number VARCHAR(255) NOT NULL,
    tenant_fname VARCHAR(255),
    tenant_lname VARCHAR(255),
    tenant_email VARCHAR(255),
    tenant_phone VARCHAR(255),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

CREATE TABLE IF NOT EXISTS problems (
    id INT(255) PRIMARY KEY NOT NULL AUTO_INCREMENT,
    tenant_id INT(255) NOT NULL,
    problem_description TEXT NOT NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(account_id)
);

CREATE TABLE IF NOT EXISTS problem_images (
    id INT(255) PRIMARY KEY NOT NULL AUTO_INCREMENT,
    problem_id INT(255) NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (problem_id) REFERENCES problems(id)
);

CREATE TABLE IF NOT EXISTS inbox (
    inbox_id INT(255) PRIMARY KEY NOT NULL AUTO_INCREMENT,
    tenant_id INT(255) NOT NULL,
    admin_id INT(255) NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(account_id),
    FOREIGN KEY (admin_id) REFERENCES admin(account_id)
);

CREATE TABLE IF NOT EXISTS messages (
    message_id INT(255) PRIMARY KEY NOT NULL AUTO_INCREMENT,
    inbox_id INT(255) NOT NULL,
    sender_id INT(255) NOT NULL,
    message_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (inbox_id) REFERENCES inbox(inbox_id),
    FOREIGN KEY (sender_id) REFERENCES accounts(account_id)
);

CREATE TABLE IF NOT EXISTS inbox_participants (
    inbox_id INT NOT NULL,
    account_id INT NOT NULL,
    last_read_message_id INT DEFAULT NULL,
    PRIMARY KEY (inbox_id, account_id),
    FOREIGN KEY (inbox_id) REFERENCES inbox(inbox_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (last_read_message_id) REFERENCES messages(message_id) ON DELETE SET NULL
);