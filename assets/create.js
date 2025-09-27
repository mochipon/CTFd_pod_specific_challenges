CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$
    _CTFd.lib.markdown()

    const modalSelector = "#challenge-create-options"

    function ensurePodSpecificFields() {
        const modal = $(modalSelector)
        if (!modal.length) {
            return
        }

        const defaultGroup = modal.find("input[name='flag']").closest(".form-group")
        if (!defaultGroup.length) {
            return
        }

        const label = defaultGroup.find("label")
        if (label.length) {
            label.html(
                "Default Flag:<br><small class=\"form-text text-muted d-block mt-1\">Flag used when no pod specific flag matches.</small>"
            )
        }

        if (!modal.find("[data-pod-specific-flags]").length) {
            const podSection = $(
                `<div class="form-group mb-4" data-pod-specific-flags>
                    <label class="form-label">
                        Pod Specific Flags:
                        <small class="form-text text-muted d-block">
                            Add flag overrides per pod. Leave blank to skip.
                        </small>
                    </label>
                    <div class="pod-flag-rows mb-3"></div>
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-add-pod-flag>
                        <i class="fas fa-plus me-1"></i>Add Pod Flag
                    </button>
                </div>`
            )
            defaultGroup.after(podSection)
            addPodFlagRow(podSection.find(".pod-flag-rows"))
        }
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
    }

    function addPodFlagRow(container, podId = "", flagValue = "") {
        const row = $(
            `<div class="row g-2 align-items-center mb-2 px-3" data-pod-flag-row>
                <div class="col-3">
                    <input type="number" class="form-control form-control-sm pod-flag-pod"
                           min="0" placeholder="Pod ID" value="${escapeHtml(podId)}">
                </div>
                <div class="col-8">
                    <input type="text" class="form-control form-control-sm pod-flag-value"
                           placeholder="Flag value" value="${escapeHtml(flagValue)}">
                </div>
                <div class="col-1">
                    <button type="button" class="btn btn-outline-danger btn-sm form-control form-control-sm"
                            data-remove-pod-flag title="Remove">
                        &times;
                    </button>
                </div>
            </div>`
        )
        container.append(row)
    }

    function gatherPodFlags(modal) {
        const rows = modal.find("[data-pod-flag-row]")
        const mapping = []
        rows.each((index, element) => {
            const row = $(element)
            const podText = row.find(".pod-flag-pod").val()
            const flagText = row.find(".pod-flag-value").val()
            const trimmedFlag = flagText ? String(flagText).trim() : ""

            if (podText === "" && trimmedFlag === "") {
                return
            }

            const podId = parseInt(podText, 10)
            if (Number.isNaN(podId)) {
                throw new Error(`Invalid pod id '${podText}' on line ${index + 1}.`)
            }

            if (!trimmedFlag) {
                return
            }

            mapping.push({ podId, value: trimmedFlag })
        })

        return mapping
    }

    function postFlag(payload) {
        return CTFd.fetch("/api/v1/flags", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    return data
                }
                const errors = data.errors
                if (errors) {
                    const messages = Object.entries(errors)
                        .map(([key, value]) => `${key}: ${[].concat(value).join(", ")}`)
                        .join("\n")
                    throw new Error(messages)
                }
                throw new Error("Unable to create flag")
            })
    }

    function showAlert(title, message) {
        if (window.ezAlert) {
            window.ezAlert({ title, body: message, button: "OK" })
        } else {
            window.alert(`${title}: ${message}`)
        }
    }

    function handlePodSpecificOptions(event) {
        event.preventDefault()

        const form = event.target
        const params = $(form).serializeJSON(true)
        const challengeId = params.challenge_id

        const defaultFlagParams = {
            challenge_id: challengeId,
            content: params.flag || "",
            type: params.flag_type,
            data: params.flag_data ? params.flag_data : "",
        }

        const flagPromises = []
        if (defaultFlagParams.content.length > 0) {
            flagPromises.push(postFlag(defaultFlagParams))
        }

        let mapping
        try {
            mapping = gatherPodFlags($(modalSelector))
        } catch (error) {
            showAlert("Invalid Pod Flags", error.message)
            return
        }

       mapping.forEach(({ podId, value }) => {
            flagPromises.push(
                postFlag({
                    challenge_id: challengeId,
                    content: value,
                    type: "pod_specific",
                    data: String(podId),
                })
            )
        })

        const uploadPromise = new Promise((resolve) => {
            const fileInput = form.elements["file"]
            if (
                fileInput &&
                fileInput.value &&
                window.helpers &&
                window.helpers.files &&
                typeof window.helpers.files.upload === "function"
            ) {
                window.helpers.files.upload(form, {
                    challenge: challengeId,
                    type: "challenge",
                })
            }
            resolve()
        })

        const saveChallenge = () => {
            CTFd.fetch(`/api/v1/challenges/${challengeId}`, {
                method: "PATCH",
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ state: params.state }),
            })
                .then((response) => response.json())
                .then((data) => {
                    if (data.success) {
                        setTimeout(() => {
                            window.location = `${CTFd.config.urlRoot}/admin/challenges/${challengeId}`
                        }, 700)
                    }
                })
        }

        Promise.all([...flagPromises, uploadPromise])
            .then(() => {
                saveChallenge()
            })
            .catch((error) => {
                const message = error && error.message ? error.message : "Unable to save pod flags"
                showAlert("Error", message)
            })
    }

    $(document).ready(() => {
        ensurePodSpecificFields()
        const modal = $(modalSelector)
        if (modal.length) {
            modal.on("show.bs.modal", ensurePodSpecificFields)
            const form = modal.find("form")
            if (form.length) {
                form.off("submit")
                form.on("submit", handlePodSpecificOptions)
            }
            modal.on("click", "[data-add-pod-flag]", function () {
                const rows = modal.find(".pod-flag-rows")
                addPodFlagRow(rows)
            })
            modal.on("click", "[data-remove-pod-flag]", function () {
                const rows = modal.find(".pod-flag-rows")
                const row = $(this).closest("[data-pod-flag-row]")
                if (row.length) {
                    if (rows.find("[data-pod-flag-row]").length > 1) {
                        row.remove()
                    } else {
                        row.find("input").val("")
                    }
                }
            })
        }
    })
})
