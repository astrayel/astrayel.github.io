# Widget Générateur de PDF pour Grist

Ce widget permet de générer des rapports PDF mensuels (Signalisations et Transports) à partir de vos données Grist.

## Installation

1.  **Hébergement** :
    - Hébergez les fichiers (`index.html`, `style.css`, `script.js`) sur un serveur web accessible par votre navigateur (ex: GitHub Pages, ou un serveur local).
    - Pour tester localement, vous pouvez utiliser Python :
      ```bash
      python -m http.server 8000
      ```
      L'URL sera alors `http://localhost:8000`.

2.  **Intégration dans Grist** :
    - Ouvrez votre document Grist.
    - Ajoutez un nouveau widget "Custom" (Personnalisé).
    - Dans le panneau de droite (Créateur de widget), sélectionnez "Custom URL" et entrez l'URL de votre widget (ex: `http://localhost:8000`).
    - **Important** : Donnez l'accès "Read selected table" (Lire la table sélectionnée) ou "Full Access".

3.  **Configuration des Colonnes** :
    - Le widget va vous demander de mapper les colonnes. Assurez-vous de lier les champs de votre table aux champs attendus par le widget :
        - **Date** : La colonne contenant la date (Mois/Année).
        - **Service** : Le nom du service.
        - **Nb Signalisations**, **Nb Mis en Cause**, **Taux Papillaires**, **Taux Génétiques**...
        - **Objectifs** : Si vous avez des colonnes d'objectifs, liez-les. Sinon, vous pouvez créer des colonnes de formule avec des valeurs fixes (ex: `=15`).

## Utilisation

1.  Sélectionnez l'année et le mois dans les menus déroulants.
2.  Cliquez sur "Générer PDF".
3.  Le PDF sera téléchargé automatiquement.

## Notes Techniques

- Le widget utilise `jspdf` pour la génération PDF et `Chart.js` pour les graphiques.
- Les calculs "12 mois glissants" se basent sur la colonne "Date". Assurez-vous d'avoir un historique suffisant pour que les graphiques soient pertinents.
