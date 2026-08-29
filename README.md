# Tabula

Tabula est une application de bureau personnelle pour suivre ses dépenses et ses revenus au quotidien. Conçue pour un usage local et autonome, elle fonctionne directement sur la machine, sans compte utilisateur, sans serveur et sans collecte de données.

![Aperçu Tabula - Tableau de bord](assets/sc01.png)

---

## Fonctionnalités

- **Gestion des comptes et catégories :** Création libre de comptes bancaires (avec solde initial) et de catégories personnalisées.
- **Recherche en direct :** Filtrage à la frappe sans prise en compte des accents (recherche par description, date, catégorie, compte ou montant).
- **Carrousel des soldes :** Visualisation du solde global et défilement entre les différents comptes.
- **Précision monétaire :** Calculs gérés en centimes entiers pour éviter les erreurs d'arrondi.
- **Thèmes :** Prise en charge du thème sombre, clair ou système.
- **Gestion des données :** Sauvegarde, restauration et réinitialisation de la base locale au format JSON.

<p align="center">
  <img src="assets/sc02.png" width="49%" alt="Nouvelle opération" />
  <img src="assets/sc03.png" width="49%" alt="Paramètres" />
</p>

---

## Fonctionnement technique

L'application est développée avec les technologies web standards, sans framework JavaScript :

- **Socle :** [Electron](https://www.electronjs.org/) & [Node.js](https://nodejs.org/)
- **Interface :** HTML5, CSS3 et JavaScript vanilla (ES6)
- **Stockage :** Fichier JSON local

---

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

### Windows et macOS

La prise en charge de Windows et macOS n'est pas encore finalisée et sera ajoutée dans de futures versions.

---

## Évolutions à venir

Le socle est pleinement opérationnel. Les versions mineures suivantes apporteront progressivement :

- Support des exécutables Windows (`.exe`) et macOS (`.dmg`).
- Outils d'analyse financière et visualisations graphiques.
- Module de génération et d'exportation de rapports comptables (PDF, CSV).
- Planification automatique des opérations récurrentes (abonnements, loyers).
- Règles d'automatisation et d'auto-complétion à la saisie.
- Gestionnaire de mises à jour intégré.

---

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

---

## Licence

Ce projet est sous licence [MIT](LICENSE).