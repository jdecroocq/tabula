# Tabula

Tabula est une application de bureau personnelle pour suivre ses dépenses et ses revenus au quotidien. Conçue pour un usage local et autonome, elle fonctionne directement sur la machine, sans compte utilisateur, sans serveur et sans collecte de données.

![Aperçu Tabula - Tableau de bord](assets/sc01.png)


- **Gestion des comptes et catégories :** Création libre de comptes bancaires (avec solde initial) et de catégories personnalisées.
- **Règles d'automatisation :** Création de commandes de remplissage automatique.
- **Opérations récurrentes :** Planification de charges fixes (mensuelles, annuelles, hebdomadaires) avec génération des opérations et validation au démarrage.
- **Recherche en direct :** Filtrage à la frappe sans prise en compte des accents et de la casse ; recherche par description, date, catégorie, compte ou montant.
- **Carrousel des soldes :** Visualisation du solde global et défilement entre les différents comptes.
- **Précision monétaire :** Calculs gérés en centimes entiers pour éviter les erreurs d'arrondi.
- **Gestionnaire de mise à jour :** Détection des nouvelles versions publiées depuis les paramètres de l'application.
- **Thèmes :** Prise en charge du thème sombre, clair ou système.
- **Gestion des données :** Sauvegarde, restauration, choix de l'emplacement et réinitialisation de la base locale au format JSON.

<p align="center">
  <img src="assets/sc02.png" width="49%" alt="Nouvelle opération" />
  <img src="assets/sc03.png" width="49%" alt="Paramètres" />
</p>


## Téléchargement et installation

Les paquets compilés sont disponibles dans la section [Releases](https://github.com/jdecroocq/tabula/releases).

### Linux

- **Paquet Debian / Ubuntu (`.deb`) :**
   Installation avec un gestionnaire de paquets graphique ou en ligne de commande :
   ```bash
   sudo apt install ./tabula_*.deb
   ```

- **Binaire autonome (`.AppImage`) :**
   Rendre le fichier exécutable et le lancer :
   ```bash
   chmod +x Tabula-*.AppImage
   ./Tabula-*.AppImage
   ```

### Windows

- **Installateur standard (`Setup.exe`) :**
  Double-cliquez sur le fichier pour installer Tabula et créer les raccourcis Bureau et Menu Démarrer.
- **Version portable (`.exe`) :**
  Exécutable autonome prêt à l'emploi sans installation (idéal sur clé USB).

### macOS
La prise en charge de macOS n'est pas proposée pour le moment.

## Lancer le projet en local

Pour exécuter ou modifier le code source sur sa machine :

```bash
# 1. Cloner le projet
git clone https://github.com/jdecroocq/tabula.git
cd tabula

# 2. Installer les dépendances
npm install

# 3. Lancer l'application
npm start

# 4. Compiler pour Linux (.deb et .AppImage)
npm run dist
```


## Licence

Ce projet est sous licence [MIT](LICENSE).