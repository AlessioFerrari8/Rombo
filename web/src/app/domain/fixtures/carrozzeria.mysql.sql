-- Generato da Rombo (mysql)

CREATE TABLE `Proprietario` (
  `CF` CHAR(16) NOT NULL,
  `Nome` VARCHAR(255) NOT NULL,
  `Cognome` VARCHAR(255) NOT NULL,
  `Telefono` VARCHAR(20),
  CONSTRAINT `pk_Proprietario` PRIMARY KEY (`CF`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `Auto` (
  `Targa` VARCHAR(10) NOT NULL,
  `Modello` VARCHAR(255) NOT NULL,
  `Marca` VARCHAR(255) NOT NULL,
  `Anno` INT NOT NULL,
  `CF_Proprietario` CHAR(16) NOT NULL,
  CONSTRAINT `pk_Auto` PRIMARY KEY (`Targa`),
  CONSTRAINT `fk_Auto_1` FOREIGN KEY (`CF_Proprietario`) REFERENCES `Proprietario` (`CF`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `Dipendente` (
  `Matricola` INT NOT NULL,
  `Nome` VARCHAR(255) NOT NULL,
  `Cognome` VARCHAR(255) NOT NULL,
  CONSTRAINT `pk_Dipendente` PRIMARY KEY (`Matricola`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `Intervento` (
  `Codice` INT NOT NULL,
  `Data` DATE NOT NULL,
  `Descrizione` TEXT NOT NULL,
  `Costo` DECIMAL(8,2) NOT NULL,
  `Targa_Auto` VARCHAR(10) NOT NULL,
  CONSTRAINT `pk_Intervento` PRIMARY KEY (`Codice`),
  CONSTRAINT `fk_Intervento_1` FOREIGN KEY (`Targa_Auto`) REFERENCES `Auto` (`Targa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `fa` (
  `Matricola_Dipendente` INT NOT NULL,
  `Codice_Intervento` INT NOT NULL,
  `Ore` INT NOT NULL,
  CONSTRAINT `pk_fa` PRIMARY KEY (`Matricola_Dipendente`, `Codice_Intervento`),
  CONSTRAINT `fk_fa_1` FOREIGN KEY (`Matricola_Dipendente`) REFERENCES `Dipendente` (`Matricola`),
  CONSTRAINT `fk_fa_2` FOREIGN KEY (`Codice_Intervento`) REFERENCES `Intervento` (`Codice`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
