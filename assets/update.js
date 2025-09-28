/**
 * Pod Specific Challenges - Update Challenge JavaScript
 *
 * Provides enhanced functionality for updating pod-specific challenges,
 * including pod flag management and validation.
 */

CTFd.plugin.run((_CTFd) => {
    "use strict";

    const $ = _CTFd.lib.$;
    _CTFd.lib.markdown();

    const modalSelector = "#challenge-update-modal";

    /**
     * Update the pod description previews based on current editor content
     */
    function updatePreviews() {
        const description = $('#new-desc-editor').val() || '';
        // Update previews
        const preview1 = description.replace(/:pod_id:/g, '1');
        const preview2 = description.replace(/:pod_id:/g, '2');

        $('#preview-pod-1').html(preview1 || 'No description yet...');
        $('#preview-pod-2').html(preview2 || 'No description yet...');
    }

    /**
     * Ensure pod-specific fields are present in the update modal
     */
    function ensurePodSpecificFields() {
        const modal = $(modalSelector);
        if (!modal.length) {
            console.debug("Pod specific challenges: Update modal not found");
            return;
        }

        const defaultGroup = modal.find("input[name='flag']").closest(".form-group");
        if (!defaultGroup.length) {
            console.debug("Pod specific challenges: Default flag group not found");
            return;
        }

        // Update the label for the default flag field
        const label = defaultGroup.find("label");
        if (label.length && !label.attr("data-pod-updated")) {
            label.html(
                "Default Flag:<br><small class=\"form-text text-muted\">Flag used when no pod specific flag matches.</small>"
            ).attr("data-pod-updated", "true");
        }

        // Add pod-specific flags section if not already present
        if (!modal.find("[data-pod-specific-flags]").length) {
            const podSection = $(
                `<div class="form-group" data-pod-specific-flags>
                    <label>
                        Pod Specific Flags:<br>
                        <small class="form-text text-muted">
                            Manage flag overrides per pod. Changes are saved immediately.
                        </small>
                    </label>
                    <div class="pod-flag-rows"></div>
                    <button type="button" class="btn btn-outline-secondary btn-sm mt-2" data-add-pod-flag>
                        Add Pod Flag
                    </button>
                    <div class="text-muted small mt-2">
                        <strong>Note:</strong> Existing pod flags are managed through the flags section.
                    </div>
                </div>`
            );
            defaultGroup.after(podSection);
            loadExistingPodFlags(modal);
        }
    }

    /**
     * Load existing pod-specific flags for the current challenge
     */
    function loadExistingPodFlags(modal) {
        const challengeId = modal.find("input[name='id']").val();
        if (!challengeId) {
            console.debug("Pod specific challenges: No challenge ID found for loading flags");
            return;
        }

        // Fetch existing flags for this challenge
        CTFd.fetch(`/api/v1/challenges/${challengeId}/flags`, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && Array.isArray(data.data)) {
                const podFlags = data.data.filter(flag => flag.type === "pod_specific");
                displayExistingPodFlags(modal, podFlags);
            } else {
                console.warn("Pod specific challenges: Unexpected API response format", data);
            }
        })
        .catch(error => {
            console.error("Pod specific challenges: Failed to load existing flags", error);
            showAlert("Warning", "Could not load existing pod flags. You can still add new ones.");
        });
    }

    /**
     * Display existing pod flags in the interface
     */
    function displayExistingPodFlags(modal, flags) {
        if (!Array.isArray(flags) || flags.length === 0) {
            return;
        }

        const container = modal.find(".pod-flag-rows");
        const existingSection = $(
            `<div class="existing-pod-flags">
                <h6 class="text-muted mb-3">Existing Pod Flags</h6>
            </div>`
        );

        flags.forEach(flag => {
            const podId = flag.data || "unknown";
            const flagContent = flag.content || "";
            const flagId = flag.id;

            const flagRow = $(
                `<div class="row g-2 align-items-center mb-2" data-existing-flag="${escapeHtml(flagId)}">
                    <div class="col-md-2">
                        <span class="badge bg-primary">Pod ${escapeHtml(podId)}</span>
                    </div>
                    <div class="col-md-8">
                        <code class="text-break">${escapeHtml(flagContent)}</code>
                    </div>
                    <div class="col-md-2 text-end">
                        <button type="button" class="btn btn-outline-danger btn-sm"
                                data-delete-existing-flag="${escapeHtml(flagId)}"
                                title="Delete flag">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>`
            );
            existingSection.append(flagRow);
        });

        // Add separator
        existingSection.append('<hr class="my-3">');
        existingSection.append('<h6 class="text-muted mb-3">Add New Pod Flags</h6>');

        container.append(existingSection);
    }

    /**
     * Handle deletion of existing pod flags
     */
    function handleDeleteExistingFlag(flagId) {
        if (!flagId || !confirm("Are you sure you want to delete this pod flag?")) {
            return;
        }

        CTFd.fetch(`/api/v1/flags/${flagId}`, {
            method: "DELETE",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                $(`[data-existing-flag="${flagId}"]`).fadeOut(300, function() {
                    $(this).remove();
                });
                showAlert("Success", "Pod flag deleted successfully");
            } else {
                throw new Error(data.message || "Delete operation failed");
            }
        })
        .catch(error => {
            console.error("Pod specific challenges: Failed to delete flag", error);
            showAlert("Error", `Failed to delete flag: ${error.message}`);
        });
    }

    /**
     * Add a new pod flag row to the interface
     */
    function addPodFlagRow(container, podId = "", flagValue = "") {
        const row = $(
            `<div class="row g-2 align-items-center mb-2" data-pod-flag-row>
                <div class="col-md-4">
                    <input type="number" class="form-control form-control-sm pod-flag-pod"
                           min="0" placeholder="Pod ID" value="${escapeHtml(podId)}"
                           title="Enter the pod ID (must be a non-negative integer)">
                </div>
                <div class="col-md-7">
                    <input type="text" class="form-control form-control-sm pod-flag-value"
                           placeholder="Flag value" value="${escapeHtml(flagValue)}"
                           title="Enter the flag value for this pod">
                </div>
                <div class="col-md-1 text-end">
                    <button type="button" class="btn btn-outline-danger btn-sm"
                            data-remove-pod-flag title="Remove row">&times;</button>
                </div>
            </div>`
        );
        container.find(".pod-flag-rows").append(row);
    }

    /**
     * Safely escape HTML content to prevent XSS
     */
    function escapeHtml(value) {
        if (value == null) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Gather pod flag data from the interface
     */
    function gatherPodFlags(modal) {
        const rows = modal.find("[data-pod-flag-row]");
        const mapping = [];
        const errors = [];

        rows.each((index, element) => {
            const row = $(element);
            const podText = row.find(".pod-flag-pod").val();
            const flagText = row.find(".pod-flag-value").val();
            const trimmedFlag = flagText ? String(flagText).trim() : "";

            // Skip empty rows
            if (podText === "" && trimmedFlag === "") {
                return;
            }

            // Validate pod ID
            const podId = parseInt(podText, 10);
            if (Number.isNaN(podId)) {
                errors.push(`Invalid pod ID '${podText}' on row ${index + 1}.`);
                return;
            }

            if (podId < 0) {
                errors.push(`Pod ID must be non-negative on row ${index + 1}.`);
                return;
            }

            // Validate flag value
            if (!trimmedFlag) {
                errors.push(`Empty flag value for pod ${podId} on row ${index + 1}.`);
                return;
            }

            // Check for duplicates
            if (mapping.some(item => item.podId === podId)) {
                errors.push(`Duplicate pod ID ${podId} found.`);
                return;
            }

            mapping.push({ podId, value: trimmedFlag });
        });

        if (errors.length > 0) {
            throw new Error(errors.join("\n"));
        }

        return mapping;
    }

    /**
     * Create a new pod-specific flag via API
     */
    function createPodFlag(challengeId, podId, flagValue) {
        const payload = {
            challenge_id: challengeId,
            content: flagValue,
            type: "pod_specific",
            data: String(podId),
        };

        return CTFd.fetch("/api/v1/flags", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data.success) {
                const errors = data.errors || {};
                const messages = Object.entries(errors)
                    .map(([key, value]) => `${key}: ${[].concat(value).join(", ")}`)
                    .join("; ");
                throw new Error(messages || "Failed to create flag");
            }
            return data;
        });
    }

    /**
     * Handle saving new pod flags
     */
    function handleSavePodFlags(modal) {
        const challengeId = modal.find("input[name='id']").val();
        if (!challengeId) {
            showAlert("Error", "Challenge ID not found");
            return;
        }

        let mapping;
        try {
            mapping = gatherPodFlags(modal);
        } catch (error) {
            showAlert("Invalid Pod Flags", error.message);
            return;
        }

        if (mapping.length === 0) {
            console.debug("Pod specific challenges: No new pod flags to save");
            return;
        }

        // Show saving indicator
        const saveButton = modal.find("[data-save-pod-flags]");
        const originalText = saveButton.text();
        saveButton.prop("disabled", true).text("Saving...");

        // Create flags sequentially to avoid race conditions
        const flagPromises = mapping.map(({ podId, value }) =>
            createPodFlag(challengeId, podId, value)
        );

        Promise.all(flagPromises)
            .then(() => {
                showAlert("Success", `Created ${mapping.length} pod-specific flag(s)`);
                // Clear the new flag rows
                modal.find("[data-pod-flag-row]").remove();
                // Reload the existing flags
                modal.find(".existing-pod-flags").remove();
                loadExistingPodFlags(modal);
            })
            .catch(error => {
                console.error("Pod specific challenges: Failed to save pod flags", error);
                showAlert("Error", `Failed to save pod flags: ${error.message}`);
            })
            .finally(() => {
                saveButton.prop("disabled", false).text(originalText);
            });
    }

    /**
     * Show alert message to user
     */
    function showAlert(title, message) {
        if (typeof window.ezAlert === "function") {
            window.ezAlert({
                title: title,
                body: message,
                button: "OK"
            });
        } else {
            // Fallback to browser alert
            window.alert(`${title}: ${message}`);
        }
    }

    /**
     * Initialize the plugin when document is ready
     */
    $(document).ready(() => {
        // Ensure fields are present when modal is shown
        const modal = $(modalSelector);
        if (modal.length) {
            modal.on("show.bs.modal", ensurePodSpecificFields);

            // Event delegation for dynamic elements
            modal.on("click", "[data-add-pod-flag]", function() {
                const container = modal.find("[data-pod-specific-flags]");
                addPodFlagRow(container);
            });

            modal.on("click", "[data-remove-pod-flag]", function() {
                const row = $(this).closest("[data-pod-flag-row]");
                const allRows = modal.find("[data-pod-flag-row]");

                if (allRows.length > 1) {
                    row.fadeOut(200, function() { $(this).remove(); });
                } else {
                    // Clear the last row instead of removing it
                    row.find("input").val("");
                }
            });

            modal.on("click", "[data-delete-existing-flag]", function() {
                const flagId = $(this).data("delete-existing-flag");
                handleDeleteExistingFlag(flagId);
            });

            // Add save button for new pod flags
            modal.on("show.bs.modal", function() {
                setTimeout(() => {
                    const podSection = modal.find("[data-pod-specific-flags]");
                    if (podSection.length && !podSection.find("[data-save-pod-flags]").length) {
                        const saveButton = $(
                            `<button type="button" class="btn btn-success btn-sm mt-2 me-2" data-save-pod-flags>
                                Save New Pod Flags
                            </button>`
                        );
                        podSection.find("[data-add-pod-flag]").before(saveButton);
                    }
                }, 100);
            });

            modal.on("click", "[data-save-pod-flags]", function() {
                handleSavePodFlags(modal);
            });
        }

        $('#new-desc-editor').on('input', updatePreviews);
        updatePreviews(); // Initial count

        // Initialize fields immediately if modal is already visible
        ensurePodSpecificFields();
    });
});
