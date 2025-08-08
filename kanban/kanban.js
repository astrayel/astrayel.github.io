class GristKanbanWidget {
    constructor() {
        this.records = [];
        this.columns = {};
        this.draggedElement = null;
        this.tableId = null;
        this.editingRecord = null;
        this.allColumns = ['planned', 'todo', 'calls', 'mails', 'in-progress', 'done'];
        this.init();
    }

    async init() {
        await this.setupGrist();
        this.setupEventListeners();
    }

    async setupGrist() {
        try {
            grist.ready({
                columns: [
                    { name: 'title', title: 'Titre', type: 'Text', optional: false },
                    { name: 'description', title: 'Description', type: 'Text', optional: true },
                    { name: 'status', title: 'Statut', type: 'Choice', optional: false },
                    { name: 'priority', title: 'Priorité', type: 'Choice', optional: true },
                    { name: 'assignee', title: 'Assigné à', type: 'Text', optional: true },
                    { name: 'due_date', title: 'Date d\'échéance', type: 'Date', optional: true },
                    { name: 'image_url', title: 'Image URL', type: 'Text', optional: true },
                    { name: 'color', title: 'Couleur', type: 'Choice', optional: true },
                    { name: 'order_position', title: 'Position', type: 'Numeric', optional: true }
                ],
                requiredAccess: 'full'
            });

            grist.onRecords(async (records, mappings, options) => {
                this.records = records;
                this.columns = mappings;
                
                // Récupérer tableId depuis les options ou les métadonnées
                if (options && options.tableId) {
                    this.tableId = options.tableId;
                } else if (!this.tableId) {
                    // Essayer de déduire le tableId depuis l'URL ou le contexte
                    await this.getTableId();
                }
                
                console.log('TableId actuel:', this.tableId);
                this.renderKanban();
            });

            grist.onOptions((options, info) => {
                console.log('Options mises à jour:', options);
                if (info && info.tableId) {
                    this.tableId = info.tableId;
                }
            });

        } catch (error) {
            console.error('Erreur lors de l\'initialisation Grist:', error);
            this.showNoData();
        }
    }

    setupEventListeners() {
        const refreshBtn = document.getElementById('refresh-btn');
        refreshBtn.addEventListener('click', () => {
            this.refreshData();
        });

        this.setupDragAndDrop();
        this.setupModal();
        this.setupAddButtons();
    }

    setupDragAndDrop() {
        const board = document.getElementById('kanban-board');
        const columns = document.querySelectorAll('.column-content');
        
        columns.forEach(column => {
            column.addEventListener('dragover', (e) => {
                e.preventDefault();
                column.classList.add('drag-over');
                
                const draggingCard = document.querySelector('.kanban-card.dragging');
                if (draggingCard && column.contains(draggingCard)) {
                    // Drag dans la même colonne - gestion de la réorganisation
                    this.handleInColumnDrag(e, column);
                } else {
                    // Nettoyer les placeholders des autres colonnes
                    this.clearDragPlaceholders(column);
                }
            });

            column.addEventListener('dragleave', (e) => {
                if (!column.contains(e.relatedTarget)) {
                    column.classList.remove('drag-over');
                    // Ne supprimer que les placeholders de cette colonne spécifiquement
                    const placeholder = column.querySelector('.drag-placeholder');
                    if (placeholder) {
                        placeholder.remove();
                    }
                }
            });

            column.addEventListener('drop', (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');
                board.classList.remove('dragging');
                
                if (this.draggedElement) {
                    const newStatus = column.parentElement.dataset.status;
                    const recordId = parseInt(this.draggedElement.dataset.recordId);
                    const currentColumn = this.draggedElement.parentElement;
                    
                    if (currentColumn === column) {
                        // Réorganisation dans la même colonne
                        console.log('Réorganisation dans la même colonne détectée');
                        this.reorderInColumn(e, column, recordId);
                    } else {
                        // Déplacement vers une autre colonne
                        console.log('Déplacement vers une autre colonne');
                        this.updateRecordStatus(recordId, newStatus);
                        this.clearDragPlaceholders();
                    }
                } else {
                    this.clearDragPlaceholders();
                }
            });
        });
    }

    setupAddButtons() {
        const addButtons = document.querySelectorAll('.add-task-btn');
        addButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const status = button.dataset.status;
                this.createNewTask(status);
            });
        });
    }

    handleInColumnDrag(e, column) {
        const draggingCard = document.querySelector('.kanban-card.dragging');
        if (!draggingCard) {
            console.log('Pas de carte en cours de drag trouvée');
            return;
        }

        const afterElement = this.getDragAfterElement(column, e.clientY);
        console.log('Élément après lequel insérer:', afterElement);
        
        // Supprimer seulement les placeholders dans cette colonne
        const existingPlaceholder = column.querySelector('.drag-placeholder');
        if (existingPlaceholder) {
            existingPlaceholder.remove();
        }
        
        const placeholder = document.createElement('div');
        placeholder.className = 'drag-placeholder';
        console.log('Création du placeholder:', placeholder);
        
        if (afterElement == null) {
            column.appendChild(placeholder);
            console.log('Placeholder ajouté à la fin de la colonne');
        } else {
            column.insertBefore(placeholder, afterElement);
            console.log('Placeholder inséré avant:', afterElement);
        }
        
        console.log('Placeholder dans le DOM:', column.querySelector('.drag-placeholder'));
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    clearDragPlaceholders(excludeColumn = null) {
        document.querySelectorAll('.drag-placeholder').forEach(placeholder => {
            if (!excludeColumn || !excludeColumn.contains(placeholder)) {
                placeholder.remove();
            }
        });
    }

    setupModal() {
        const modal = document.getElementById('edit-modal');
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = document.getElementById('cancel-edit');
        const form = document.getElementById('edit-form');

        closeBtn.addEventListener('click', () => this.closeModal());
        cancelBtn.addEventListener('click', () => this.closeModal());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEditedRecord();
        });
    }

    async updateRecordStatus(recordId, newStatus) {
        try {
            const statusMapping = {
                'planned': 'À prévoir',
                'todo': 'À faire',
                'calls': 'Appels',
                'mails': 'Mails',
                'in-progress': 'En cours',
                'done': 'Terminé'
            };

            const statusColumn = this.columns.status;
            if (!statusColumn) {
                console.error('Colonne statut non trouvée');
                return;
            }

            // Utiliser grist.docApi.getRecords pour mettre à jour via la selection courante
            // Cela évite le problème du tableId
            await grist.setCursorPos({ rowId: recordId });
            
            // Utiliser l'API de mise à jour via la sélection courante
            const updateData = {
                [statusColumn]: statusMapping[newStatus] || newStatus
            };
            
            // Approche simplifiée : sélectionner l'enregistrement puis le modifier
            try {
                // D'abord sélectionner l'enregistrement
                await grist.setCursorPos({ rowId: recordId });
                
                // Obtenir les informations sur la table sélectionnée  
                const selectedRecord = await grist.fetchSelectedRecord();
                console.log('Enregistrement sélectionné:', selectedRecord);
                
                // Déduire le nom de la table depuis l'environnement
                // ou utiliser 'Table1' par défaut si pas d'autre info
                let tableName = 'Table1'; // Fallback par défaut
                
                // Tenter de récupérer les métadonnées depuis les options ou l'environnement
                try {
                    const options = await grist.getOptions();
                    console.log('Options du widget:', options);
                    if (options && options.tableName) {
                        tableName = options.tableName;
                    }
                } catch (optError) {
                    console.log('Pas d\'options disponibles, utilisation du nom par défaut');
                }
                
                // Appliquer la mise à jour avec le nom de table
                await grist.docApi.applyUserActions([
                    ['UpdateRecord', tableName, recordId, updateData]
                ]);
                
            } catch (apiError) {
                console.error('Erreur lors de la mise à jour:', apiError);
                // Dernière tentative avec un nom de table générique
                try {
                    await grist.docApi.applyUserActions([
                        ['UpdateRecord', 'Table1', recordId, updateData]
                    ]);
                } catch (lastError) {
                    console.error('Échec de toutes les méthodes de mise à jour:', lastError);
                }
            }
            
            // Rafraîchir les données après la mise à jour
            setTimeout(() => {
                this.refreshData();
            }, 300);
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour:', error);
        }
    }

    renderKanban() {
        if (!this.records || this.records.length === 0) {
            this.showNoData();
            return;
        }

        this.hideNoData();
        this.clearColumns();

        const statusGroups = {
            'planned': [],
            'todo': [],
            'calls': [],
            'mails': [],
            'in-progress': [],
            'done': []
        };

        this.records.forEach(record => {
            const status = this.getFieldValue(record, 'status');
            const normalizedStatus = this.normalizeStatus(status);
            
            if (statusGroups[normalizedStatus] !== undefined) {
                statusGroups[normalizedStatus].push(record);
            } else {
                statusGroups['todo'].push(record);
            }
        });

        // Trier les records par position dans chaque groupe
        Object.keys(statusGroups).forEach(status => {
            statusGroups[status].sort((a, b) => {
                const posA = this.getFieldValue(a, 'order_position') || 0;
                const posB = this.getFieldValue(b, 'order_position') || 0;
                return posA - posB;
            });
            this.renderColumn(status, statusGroups[status]);
        });

        this.updateCardCounts();
    }

    normalizeStatus(status) {
        if (!status) return 'planned';
        
        const statusLower = status.toLowerCase();
        if (statusLower.includes('prévoir') || statusLower.includes('planned') || statusLower.includes('backlog')) {
            return 'planned';
        } else if (statusLower.includes('appel') || statusLower.includes('call') || statusLower.includes('téléphone')) {
            return 'calls';
        } else if (statusLower.includes('mail') || statusLower.includes('email') || statusLower.includes('courriel')) {
            return 'mails';
        } else if (statusLower.includes('fait') || statusLower.includes('terminé') || statusLower.includes('done') || statusLower.includes('complete')) {
            return 'done';
        } else if (statusLower.includes('cours') || statusLower.includes('progress') || statusLower.includes('doing')) {
            return 'in-progress';
        } else if (statusLower.includes('faire') || statusLower.includes('todo') || statusLower.includes('to do')) {
            return 'todo';
        } else {
            return 'planned';
        }
    }

    renderColumn(status, records) {
        const columnElement = document.getElementById(`${status}-column`);
        if (!columnElement) return;

        records.forEach(record => {
            const card = this.createCard(record);
            columnElement.appendChild(card);
        });
    }

    createCard(record) {
        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.draggable = true;
        card.dataset.recordId = record.id;

        const title = this.getFieldValue(record, 'title') || 'Sans titre';
        const description = this.getFieldValue(record, 'description') || '';
        const priority = this.getFieldValue(record, 'priority') || 'medium';
        const assignee = this.getFieldValue(record, 'assignee') || '';
        const dueDate = this.getFieldValue(record, 'due_date');
        const imageUrl = this.getFieldValue(record, 'image_url') || '';
        const color = this.getFieldValue(record, 'color') || 'blue';

        let priorityClass = 'priority-medium';
        if (priority.toLowerCase().includes('high') || priority.toLowerCase().includes('haute')) {
            priorityClass = 'priority-high';
        } else if (priority.toLowerCase().includes('low') || priority.toLowerCase().includes('basse')) {
            priorityClass = 'priority-low';
        }

        // Appliquer la couleur de la carte
        card.classList.add(`color-${color.toLowerCase()}`);

        const processedDescription = this.renderMarkdownAndHtml(description);

        card.innerHTML = `
            <div class="card-actions">
                <button class="edit-btn" title="Éditer">✏️</button>
                <button class="delete-btn" title="Supprimer">×</button>
            </div>
            <div class="card-title">${this.escapeHtml(title)}</div>
            ${imageUrl ? `<img src="${this.escapeHtml(imageUrl)}" class="card-image" alt="Image de la tâche" onerror="this.style.display='none'">` : ''}
            ${description ? `<div class="card-description">${processedDescription}</div>` : ''}
            <div class="card-meta">
                <div>
                    ${assignee ? `<span>👤 ${this.escapeHtml(assignee)}</span>` : ''}
                    ${dueDate ? `<span>📅 ${this.formatDate(dueDate)}</span>` : ''}
                </div>
                <span class="card-priority ${priorityClass}">${this.escapeHtml(priority)}</span>
            </div>
        `;

        // Boutons d'actions
        const deleteBtn = card.querySelector('.delete-btn');
        const editBtn = card.querySelector('.edit-btn');
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteRecord(record.id, card);
        });

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editRecord(record);
        });

        card.addEventListener('dragstart', (e) => {
            this.draggedElement = card;
            card.classList.add('dragging');
            // Ajouter la classe dragging pour les styles
            document.getElementById('kanban-board').classList.add('dragging');
        });

        card.addEventListener('dragend', (e) => {
            this.draggedElement = null;
            card.classList.remove('dragging');
            // Retirer la classe dragging après le drag
            setTimeout(() => {
                document.getElementById('kanban-board').classList.remove('dragging');
            }, 100);
        });

        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn') && !e.target.classList.contains('edit-btn')) {
                this.selectRecord(record.id);
            }
        });

        return card;
    }

    getFieldValue(record, fieldName) {
        const columnName = this.columns[fieldName];
        return columnName ? record[columnName] : null;
    }

    async selectRecord(recordId) {
        try {
            await grist.setCursorPos({ rowId: recordId });
        } catch (error) {
            console.error('Erreur lors de la sélection:', error);
        }
    }

    async deleteRecord(recordId, cardElement) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
            return;
        }

        try {
            // Animation de suppression
            cardElement.classList.add('deleting');
            
            // Attendre la fin de l'animation
            setTimeout(async () => {
                try {
                    // D'abord sélectionner l'enregistrement
                    await grist.setCursorPos({ rowId: recordId });
                    
                    // Utiliser le même système que pour la mise à jour
                    let tableName = 'Table1'; // Fallback par défaut
                    
                    try {
                        const options = await grist.getOptions();
                        if (options && options.tableName) {
                            tableName = options.tableName;
                        }
                    } catch (optError) {
                        console.log('Utilisation du nom de table par défaut pour suppression');
                    }
                    
                    // Supprimer l'enregistrement
                    await grist.docApi.applyUserActions([
                        ['RemoveRecord', tableName, recordId]
                    ]);
                    
                    // Rafraîchir les données
                    this.refreshData();
                    
                } catch (deleteError) {
                    console.error('Erreur lors de la suppression:', deleteError);
                    // Essayer avec le nom de table par défaut
                    try {
                        await grist.docApi.applyUserActions([
                            ['RemoveRecord', 'Table1', recordId]
                        ]);
                        this.refreshData();
                    } catch (lastError) {
                        console.error('Échec de toutes les méthodes de suppression:', lastError);
                        cardElement.classList.remove('deleting');
                    }
                }
            }, 300);
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            cardElement.classList.remove('deleting');
        }
    }

    clearColumns() {
        this.allColumns.forEach(status => {
            const column = document.getElementById(`${status}-column`);
            if (column) {
                column.innerHTML = '';
            }
        });
    }

    updateCardCounts() {
        this.allColumns.forEach(status => {
            const column = document.getElementById(`${status}-column`);
            const countElement = column.parentElement.querySelector('.card-count');
            if (column && countElement) {
                const cardCount = column.children.length;
                countElement.textContent = cardCount;
            }
        });
    }


    showNoData() {
        document.getElementById('no-data').style.display = 'block';
        document.getElementById('kanban-board').style.display = 'none';
    }

    hideNoData() {
        document.getElementById('no-data').style.display = 'none';
        document.getElementById('kanban-board').style.display = 'grid';
    }

    async getTableId() {
        if (this.tableId) {
            return this.tableId;
        }
        
        try {
            // Récupérer la liste des tables et leurs métadonnées
            const tables = await grist.docApi.fetchTable('_grist_Tables');
            console.log('Tables disponibles:', tables);
            
            // Si on a des enregistrements, essayer de déduire la table depuis l'un d'eux
            if (this.records && this.records.length > 0 && tables && tables.id) {
                // Prendre la première table par défaut si pas d'autre info
                this.tableId = tables.id[0];
                console.log('TableId déduit:', this.tableId);
                return this.tableId;
            }
            
            // Fallback: essayer via l'URL du widget
            const url = window.location.href;
            const tableMatch = url.match(/\/([^\/]+)\/widget/);
            if (tableMatch && tableMatch[1]) {
                this.tableId = tableMatch[1];
                console.log('TableId depuis URL:', this.tableId);
                return this.tableId;
            }
            
            console.error('Impossible de récupérer le tableId');
            return null;
            
        } catch (error) {
            console.error('Erreur lors de la récupération du tableId:', error);
            return null;
        }
    }

    async refreshData() {
        try {
            const data = await grist.fetchSelectedTable();
            console.log('Données reçues dans refreshData:', data);
            
            if (data) {
                // Vérifier si les données contiennent un tableId
                if (data.tableId && !this.tableId) {
                    this.tableId = data.tableId;
                    console.log('TableId trouvé dans refreshData:', this.tableId);
                }
                
                // Les records peuvent être directement dans data ou dans data.records
                const records = Array.isArray(data) ? data : (data.records || data);
                
                if (records && records.length > 0) {
                    this.records = records;
                    this.renderKanban();
                }
            }
        } catch (error) {
            console.error('Erreur lors du rafraîchissement:', error);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    renderMarkdownAndHtml(text) {
        if (!text) return '';
        
        // Vérifier si c'est du HTML (contient des balises)
        const htmlRegex = /<[^>]*>/;
        if (htmlRegex.test(text)) {
            // Nettoyer le HTML pour des raisons de sécurité
            return this.sanitizeHtml(text);
        }
        
        // Sinon, traiter comme du Markdown
        if (typeof marked !== 'undefined') {
            return marked.parse(text);
        }
        
        // Fallback: simple rendu markdown
        return this.simpleMarkdownRender(text);
    }

    sanitizeHtml(html) {
        const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'div', 'ul', 'ol', 'li', 'a'];
        const allowedAttributes = ['href', 'target', 'style'];
        
        // Simple nettoyage HTML (à améliorer avec une vraie bibliothèque de sanitization en prod)
        let cleaned = html;
        
        // Supprimer les scripts et autres balises dangereuses
        cleaned = cleaned.replace(/<script[^>]*>.*?<\/script>/gi, '');
        cleaned = cleaned.replace(/<style[^>]*>.*?<\/style>/gi, '');
        cleaned = cleaned.replace(/on\w+="[^"]*"/gi, '');
        
        return cleaned;
    }

    simpleMarkdownRender(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    editRecord(record) {
        this.editingRecord = record;
        
        // Remplir le formulaire avec les données actuelles
        document.getElementById('edit-title').value = this.getFieldValue(record, 'title') || '';
        document.getElementById('edit-description').value = this.getFieldValue(record, 'description') || '';
        document.getElementById('edit-status').value = this.getFieldValue(record, 'status') || 'À prévoir';
        document.getElementById('edit-priority').value = this.getFieldValue(record, 'priority') || 'Moyenne';
        document.getElementById('edit-assignee').value = this.getFieldValue(record, 'assignee') || '';
        document.getElementById('edit-color').value = this.getFieldValue(record, 'color') || 'blue';
        document.getElementById('edit-image').value = this.getFieldValue(record, 'image_url') || '';
        
        // Formater la date pour l'input date
        const dueDate = this.getFieldValue(record, 'due_date');
        if (dueDate) {
            const date = new Date(dueDate);
            document.getElementById('edit-due-date').value = date.toISOString().split('T')[0];
        }
        
        // Afficher le modal
        document.getElementById('edit-modal').style.display = 'block';
    }

    closeModal() {
        document.getElementById('edit-modal').style.display = 'none';
        this.editingRecord = null;
    }

    async saveEditedRecord() {
        const isCreating = !this.editingRecord;
        
        const formData = new FormData(document.getElementById('edit-form'));
        const updatedData = {};
        
        // Construire l'objet de mise à jour
        for (const [key, value] of formData.entries()) {
            const columnName = this.columns[key];
            if (columnName) {
                updatedData[columnName] = value;
            }
        }
        
        try {
            // Obtenir le nom de la table
            let tableName = 'Table1';
            try {
                const options = await grist.getOptions();
                if (options && options.tableName) {
                    tableName = options.tableName;
                }
            } catch (error) {
                console.log('Utilisation du nom de table par défaut');
            }
            
            if (isCreating) {
                // Créer un nouvel enregistrement
                await grist.docApi.applyUserActions([
                    ['AddRecord', tableName, null, updatedData]
                ]);
            } else {
                // Modifier l'enregistrement existant
                await grist.docApi.applyUserActions([
                    ['UpdateRecord', tableName, this.editingRecord.id, updatedData]
                ]);
            }
            
            this.closeModal();
            
            // Remettre le modal en mode édition par défaut
            document.getElementById('modal-title').textContent = 'Éditer la tâche';
            document.getElementById('save-btn').textContent = 'Sauvegarder';
            
            // Rafraîchir les données
            setTimeout(() => {
                this.refreshData();
            }, 200);
            
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            // Essayer avec le nom par défaut
            try {
                if (isCreating) {
                    await grist.docApi.applyUserActions([
                        ['AddRecord', 'Table1', null, updatedData]
                    ]);
                } else {
                    await grist.docApi.applyUserActions([
                        ['UpdateRecord', 'Table1', this.editingRecord.id, updatedData]
                    ]);
                }
                this.closeModal();
                document.getElementById('modal-title').textContent = 'Éditer la tâche';
                document.getElementById('save-btn').textContent = 'Sauvegarder';
                this.refreshData();
            } catch (lastError) {
                alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
                console.error('Échec de toutes les méthodes de sauvegarde:', lastError);
            }
        }
    }

    createNewTask(status) {
        this.editingRecord = null; // Mode création
        
        // Changer le titre du modal
        document.getElementById('modal-title').textContent = 'Nouvelle tâche';
        document.getElementById('save-btn').textContent = 'Créer';
        
        // Vider le formulaire
        document.getElementById('edit-form').reset();
        
        // Définir les valeurs par défaut
        const statusMapping = {
            'planned': 'À prévoir',
            'todo': 'À faire',
            'calls': 'Appels',
            'mails': 'Mails',
            'in-progress': 'En cours',
            'done': 'Terminé'
        };
        
        document.getElementById('edit-status').value = statusMapping[status] || 'À prévoir';
        document.getElementById('edit-priority').value = 'Moyenne';
        document.getElementById('edit-color').value = 'blue';
        
        // Calculer la position pour la nouvelle tâche (à la fin de la colonne)
        const columnCards = document.getElementById(`${status}-column`).children;
        const newPosition = columnCards.length + 1;
        
        // Afficher le modal
        document.getElementById('edit-modal').style.display = 'block';
    }

    async reorderInColumn(e, column, recordId) {
        try {
            // Trouver la nouvelle position basée sur le placeholder
            const placeholder = column.querySelector('.drag-placeholder');
            if (!placeholder) {
                console.log('Pas de placeholder trouvé');
                this.clearDragPlaceholders();
                return;
            }
            
            console.log('Placeholder trouvé:', placeholder);
            
            // Obtenir toutes les cartes dans l'ordre voulu (sans la carte en cours de drag)
            const cards = [...column.children].filter(child => 
                child.classList.contains('kanban-card') && !child.classList.contains('dragging')
            );
            
            const placeholderIndex = [...column.children].indexOf(placeholder);
            console.log('Index du placeholder:', placeholderIndex);
            console.log('Nombre total d\'éléments dans la colonne:', column.children.length);
            
            // Recalculer toutes les positions pour éviter les conflits
            const updates = [];
            let position = 1;
            
            for (let i = 0; i < column.children.length; i++) {
                const child = column.children[i];
                
                if (child === placeholder) {
                    // Insérer l'élément déplacé à cette position
                    updates.push({
                        recordId: recordId,
                        position: position
                    });
                    position++;
                } else if (child.classList.contains('kanban-card') && !child.classList.contains('dragging')) {
                    // Assigner une position aux autres cartes
                    const cardRecordId = parseInt(child.dataset.recordId);
                    if (cardRecordId !== recordId) {
                        updates.push({
                            recordId: cardRecordId,
                            position: position
                        });
                        position++;
                    }
                }
            }
            
            console.log('Mises à jour de positions:', updates);
            
            // Nettoyer les placeholders avant la mise à jour
            this.clearDragPlaceholders();
            
            // Appliquer toutes les mises à jour
            await this.updateMultiplePositions(updates);
            
        } catch (error) {
            console.error('Erreur lors de la réorganisation:', error);
            this.clearDragPlaceholders();
        }
    }

    async updateMultiplePositions(updates) {
        try {
            let tableName = 'Table1';
            try {
                const options = await grist.getOptions();
                if (options && options.tableName) {
                    tableName = options.tableName;
                }
            } catch (error) {
                console.log('Utilisation du nom de table par défaut');
            }

            const positionColumn = this.columns.order_position;
            if (!positionColumn) {
                console.error('Colonne order_position non trouvée');
                return;
            }

            // Créer les actions de mise à jour
            const actions = updates.map(update => [
                'UpdateRecord', 
                tableName, 
                update.recordId, 
                { [positionColumn]: update.position }
            ]);

            console.log('Actions à appliquer:', actions);

            // Appliquer toutes les mises à jour en une seule fois
            await grist.docApi.applyUserActions(actions);

            console.log('Positions mises à jour avec succès');

            // Rafraîchir les données
            setTimeout(() => {
                this.refreshData();
            }, 300);

        } catch (error) {
            console.error('Erreur lors de la mise à jour multiple des positions:', error);
            // Essayer avec le nom par défaut
            try {
                const positionColumn = this.columns.order_position;
                if (positionColumn) {
                    const actions = updates.map(update => [
                        'UpdateRecord', 
                        'Table1', 
                        update.recordId, 
                        { [positionColumn]: update.position }
                    ]);
                    await grist.docApi.applyUserActions(actions);
                    console.log('Positions mises à jour avec nom par défaut');
                    setTimeout(() => this.refreshData(), 300);
                }
            } catch (lastError) {
                console.error('Échec de toutes les méthodes de mise à jour des positions:', lastError);
            }
        }
    }

    async updateRecordPosition(recordId, newPosition) {
        try {
            let tableName = 'Table1';
            try {
                const options = await grist.getOptions();
                if (options && options.tableName) {
                    tableName = options.tableName;
                }
            } catch (error) {
                console.log('Utilisation du nom de table par défaut');
            }

            const positionColumn = this.columns.order_position;
            if (!positionColumn) {
                console.error('Colonne order_position non trouvée');
                return;
            }

            console.log('Mise à jour position:', recordId, 'vers position:', newPosition);
            console.log('Colonne position:', positionColumn);

            // Mettre à jour directement la position
            await grist.docApi.applyUserActions([
                ['UpdateRecord', tableName, recordId, {
                    [positionColumn]: newPosition
                }]
            ]);

            console.log('Position mise à jour avec succès');

            // Rafraîchir les données
            setTimeout(() => {
                this.refreshData();
            }, 300);

        } catch (error) {
            console.error('Erreur lors de la mise à jour de position:', error);
            // Essayer avec le nom par défaut
            try {
                const positionColumn = this.columns.order_position;
                if (positionColumn) {
                    await grist.docApi.applyUserActions([
                        ['UpdateRecord', 'Table1', recordId, {
                            [positionColumn]: newPosition
                        }]
                    ]);
                    console.log('Position mise à jour avec nom par défaut');
                    setTimeout(() => this.refreshData(), 300);
                }
            } catch (lastError) {
                console.error('Échec de toutes les méthodes de mise à jour de position:', lastError);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GristKanbanWidget();
});