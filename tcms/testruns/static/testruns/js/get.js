const allExecutionStatuses = {},
    allExecutions = {},
    expandedExecutionIds = [],
    permissions = {
        removeTag: false,
        addComment: false,
        removeComment: false,
    },
    autocomplete_cache = {}

$(document).ready(() => {

    permissions.removeTag = $('#test_run_pk').data('perm-remove-tag') === 'True'
    permissions.addComment = $('#test_run_pk').data('perm-add-comment') === 'True'
    permissions.removeComment = $('#test_run_pk').data('perm-remove-comment') === 'True'

    $('.bootstrap-switch').bootstrapSwitch()
    $('.selectpicker').selectpicker()

    const testRunId = $('#test_run_pk').data('pk')

    $('#status_button').on('switchChange.bootstrapSwitch', (_event, state) => {
        if (state) {
            jsonRPC('TestRun.update', [testRunId, { 'stop_date': null }], () => {
                $('.stop-date').html('-')
                $('#test_run_pk').parent('h1').css({ 'text-decoration': 'none' })
            })
        } else {
            const timeZone = $('#clock').data('time-zone')
            const now = currentTimeWithTimezone(timeZone)

            jsonRPC('TestRun.update', [testRunId, { 'stop_date': now }], testRun => {
                const stopDate = moment(testRun.stop_date).format("DD MMM YYYY, HH:mm a")
                $('.stop-date').html(stopDate)
                $('#test_run_pk').parent('h1').css({ 'text-decoration': 'line-through' })
            })
        }
    })

    $('.add-hyperlink-bulk').click(function () {
        $(this).parents('.dropdown').toggleClass('open')
        const selected = selectedCheckboxes()
        if ($.isEmptyObject(selected)) {
            return false
        }

        return addLinkToExecutions(selected.executionIds)
    })

    $('.remove-execution-bulk').click(function () {
        $(this).parents('.dropdown').toggleClass('open')
        const selected = selectedCheckboxes()
        if ($.isEmptyObject(selected)) {
            return false
        }

        const areYouSureText = $('#test_run_pk').data('trans-are-you-sure')
        if (confirm(areYouSureText)) {
            removeCases(testRunId, selected.caseIds)
        }

        return false
    })

    $('.change-assignee-bulk').click(function () {
        $(this).parents('.dropdown').toggleClass('open')
        changeAssigneeBulk()

        return false
    })

    $('.update-case-text-bulk').click(function () {
        $(this).parents('.dropdown').toggleClass('open')
        updateCaseText()

        return false
    })

    $('.bulk-change-status').click(function () {
        $(this).parents('.dropdown').toggleClass('open')
        // `this` is the clicked link
        const statusId = $(this).data('status-id')
        changeStatusBulk(statusId)

        // so that we don't follow the link
        return false
    })

    // bind everything in tags table
    tagsCard('TestRun', testRunId, { run: testRunId }, permissions.removeTag)

    jsonRPC('TestExecutionStatus.filter', {}, executionStatuses => {
        // convert from list to a dict for easier indexing later
        for (var i = 0; i < executionStatuses.length; i++) {
            allExecutionStatuses[executionStatuses[i].id] = executionStatuses[i]
        }

        jsonRPC('TestExecution.filter', { 'run_id': testRunId }, testExecutions => {
            drawPercentBar(testExecutions)
            renderTestExecutions(testExecutions)
            renderAdditionalInformation(testRunId)
        })
    })

    $('.bulk-select-checkbox').click(event => {
        const isChecked = event.target.checked
        const testExecutionSelectors = $('#test-executions-container').find('.test-execution-checkbox')

        testExecutionSelectors.each((_index, te) => { te.checked = isChecked })
    })

    quickSearchAndAddTestCase(testRunId, addTestCaseToRun, autocomplete_cache, { case_status__is_confirmed: true })
    $('#btn-search-cases').click(function () {
        return advancedSearchAndAddTestCases(
            testRunId, 'TestRun.add_case', $(this).attr('href'),
            $('#test_run_pk').data('trans-error-adding-cases')
        );
    });

    $('.js-toolbar-filter-options li').click(function (ev) {
        return changeDropdownSelectedItem(
            '.js-toolbar-filter-options',
            '#input-filter-button',
            ev.target,
            $('#toolbar-filter')
        )
    });

    $('#toolbar-filter').on("keyup", function () {
        let filterValue = $(this).val().toLowerCase();
        let filterBy = $('.js-toolbar-filter-options .selected')[0].dataset.filterType;

        filterTestExecutionsByProperty(
            testRunId,
            Object.values(allExecutions),
            filterBy,
            filterValue
        );
    });
})

function filterTestExecutionsByProperty(runId, executions, filterBy, filterValue) {
    // no input => show all rows
    if (filterValue.trim().length === 0) {
        $('.test-execution-element').show();
        return;
    }

    if (filterBy === 'is_automated' && filterValue !== '0' && filterValue !== '1') {
        alert($('#test_run_pk').data('trans-bool-value-required'))
        return
    }

    $('.test-execution-element').hide();

    if (filterBy === 'is_automated' || filterBy === 'priority' || filterBy === 'category') {
        let query = { case_run__run: runId }
        if (filterBy === 'is_automated') {
            query[filterBy] = filterValue
        } else if (filterBy === 'priority') {
            query['priority__value__icontains'] = filterValue
        } else if (filterBy === 'category') {
            query['category__name__icontains'] = filterValue
        }

        jsonRPC('TestCase.filter', query, function (filtered) {
            // hide again if a previous async request showed something else
            $('.test-execution-element').hide();
            filtered.forEach(tc => $(`.test-execution-case-${tc.id}`).show());
        })
    } else {
        executions.filter(function (te) {
            return (te[filterBy] && te[filterBy].toString().toLowerCase().indexOf(filterValue) > -1)
        }).forEach(te => $(`.test-execution-${te.id}`).show());
    }
}

function addTestCaseToRun(runId) {
    const caseName = $('#search-testcase')[0].value;
    const testCase = autocomplete_cache[caseName];

    // test case is already present so don't add it
    const allCaseIds = Object.values(allExecutions).map(te => te.case_id)
    if (allCaseIds.indexOf(testCase.id) > -1) {
        $('#search-testcase').val('');
        return false;
    }

    jsonRPC('TestRun.add_case', [runId, testCase.id], function (result) {
        // IMPORTANT: the API result includes a 'sortkey' field value!
        window.location.reload(true);

        // TODO: remove the page reload above and add the new case to the list
        $('#search-testcase').val('');
    });
}

function selectedCheckboxes() {
    const allSelected = $('.test-execution-checkbox:checked')

    if (!allSelected.length) {
        const warningText = $('#test_run_pk').data('trans-no-executions-selected')
        alert(warningText)

        return {}
    }

    const testCaseIds = []
    const testExecutionIds = []
    allSelected.each((_index, checkbox) => {
        checkbox = $(checkbox)

        const testExecutionId = checkbox.data('test-execution-id')
        testExecutionIds.push(testExecutionId)

        const testCaseId = checkbox.data('test-execution-case-id')
        testCaseIds.push(testCaseId)
    })

    return {
        caseIds: testCaseIds,
        executionIds: testExecutionIds,
    }
}

function drawPercentBar(testExecutions) {
    let positiveCount = 0
    let negativeCount = 0
    let allCount = testExecutions.length
    let statusCount = {}
    Object.values(allExecutionStatuses).forEach(s => statusCount[s.name] = { count: 0, id: s.id })

    testExecutions.forEach(testExecution => {
        const executionStatus = allExecutionStatuses[testExecution.status_id]

        if (executionStatus.weight > 0) {
            positiveCount++
        } else if (executionStatus.weight < 0) {
            negativeCount++
        }

        statusCount[executionStatus.name].count++
    })

    renderProgressBars(positiveCount, negativeCount, allCount)
    renderCountPerStatusList(statusCount)
}

function renderProgressBars(positiveCount, negativeCount, allCount) {

    const positivePercent = +(positiveCount / allCount * 100).toFixed(2)
    const positiveBar = $(".progress > .progress-completed")
    if (positivePercent) {
        positiveBar.text(`${positivePercent}%`)
    }
    positiveBar.css('width', `${positivePercent}%`)
    positiveBar.attr('aria-valuenow', `${positivePercent}`)

    const negativePercent = +(negativeCount / allCount * 100).toFixed(2)
    const negativeBar = $('.progress > .progress-failed')
    if (negativePercent) {
        negativeBar.text(`${negativePercent}%`)
    }
    negativeBar.css('width', `${negativePercent}%`)
    negativeBar.attr('aria-valuenow', `${negativePercent}`)

    const neutralPercent = +(100 - (negativePercent + positivePercent)).toFixed(2)
    const neutralBar = $('.progress > .progress-bar-remaining')
    if (neutralPercent) {
        neutralBar.text(`${neutralPercent}%`)
    }
    neutralBar.css('width', `${neutralPercent}%`)
    neutralBar.attr('aria-valuenow', `${neutralPercent}`)

    $(".total-execution-count").text(allCount)
}

function renderCountPerStatusList(statusCount) {
    for (var status in statusCount) {
        const statusId = statusCount[status].id

        $(`#count-for-status-${statusId}`).attr('href', `?status_id=${statusId}`).text(statusCount[status].count)
    }
}

function renderTestExecutions(testExecutions) {
    // sort executions by sortkey
    testExecutions.sort(function (te1, te2) {
        return te1.sortkey - te2.sortkey;
    });
    const container = $('#test-executions-container')

    testExecutions.forEach(testExecution => {
        container.append(renderTestExecutionRow(testExecution))
    })

    bindEvents()

    $('.test-executions-count').html(testExecutions.length)
}

function bindEvents() {
    treeViewBind()

    $('.test-execution-element').click(function (ev) {
        // don't trigger row expansion when kebab menu is clicked
        if ($(ev.target).is('button, a, input, .fa-ellipsis-v')) {
            return
        }

        const tePK = $(ev.target).
            parents('.test-execution-element').
            find('.test-execution-checkbox').
            data('test-execution-id')

        // row was expanded once, dom is ready
        if (expandedExecutionIds.indexOf(tePK) > -1) {
            return
        }
        expandedExecutionIds.push(tePK)

        getExpandArea(allExecutions[tePK])
    })
}

function getExpandArea(testExecution) {
    const container = $(`.test-execution-${testExecution.id}`)

    container.find('.test-execution-information .run-date').html(testExecution.close_date || '-')
    container.find('.test-execution-information .build').html(testExecution.build)
    container.find('.test-execution-information .text-version').html(testExecution.case_text_version)

    jsonRPC('TestCase.history',
        [testExecution.case_id, {
            history_id: testExecution.case_text_version
        }], (data) => {
            data.forEach((entry) => {
                markdown2HTML(entry.text, container.find('.test-execution-text')[0])
                container.find('.test-execution-notes').append(entry.notes)
            })
        })

    const textArea = container.find('textarea')[0]
    const fileUpload = container.find('input[type="file"]')
    const editor = initSimpleMDE(textArea, $(fileUpload), textArea.id)
    const commentsRow = container.find('.comments')

    container.find('.post-comment').click(() => {
        const input = editor.value().trim()

        if (input) {
            jsonRPC('TestExecution.add_comment', [testExecution.id, input], comment => {
                editor.value('')

                commentsRow.append(renderCommentHTML(
                    1 + template.find('.js-comment-container').length,
                    comment,
                    $('template#comment-template')[0],
                    parentNode => {
                        bindDeleteCommentButton(
                            testExecution.id,
                            'TestExecution.remove_comment',
                            permissions.removeComment,
                            parentNode)
                    }))
            })
        }
    })

    renderCommentsForObject(
        testExecution.id,
        'TestExecution.get_comments',
        'TestExecution.remove_comment',
        permissions.removeComment,
        commentsRow,
    )

    jsonRPC('TestExecution.get_links', { 'execution_id': testExecution.id }, links => {
        const ul = container.find('.test-execution-hyperlinks')
        ul.innerHTML = ''
        links.forEach(link => ul.append(renderLink(link)))
    })

    jsonRPC('TestCase.list_attachments', [testExecution.case_id], attachments => {
        const ul = container.find(`.test-case-attachments`)

        if (!attachments.length) {
            ul.find('.hidden').removeClass('hidden')
            return
        }

        const liTemplate = $('#attachments-list-item')[0].content

        attachments.forEach(attachment => {
            const li = liTemplate.cloneNode(true)
            const attachmentLink = $(li).find('a')[0]

            attachmentLink.href = attachment.url
            attachmentLink.innerText = attachment.url.split('/').slice(-1)[0]
            ul.append(li)
        })
    })

    jsonRPC('TestExecution.history', testExecution.id, history => {
        const historyContainer = container.find('.history-container')
        history.forEach(h => {
            historyContainer.append(renderHistoryEntry(h))
        })
    })
}


function renderAdditionalInformation(testRunId, execution) {
    let linksQuery = { execution__run: testRunId },
        casesQuery = { case_run__run: testRunId },
        componentQ = { cases__case_run__run: testRunId },
        tagsQ = { case__case_run__run: testRunId },
        planId = Number($('#test_run_pk').data('plan-pk'))

    // if called from reloadRowFor(execution) then filter only for
    // that one row
    if (execution) {
        linksQuery = { execution: execution.id }
        casesQuery = { case_run: execution.id }
        componentQ = { cases__case_run: execution.id }
        tagsQ = { case__case_run: execution.id }
    }

    // update bug icons for all executions
    jsonRPC('TestExecution.get_links', linksQuery, (links) => {
        const withDefects = new Set()
        links.forEach((link) => {
            if (link.is_defect) {
                withDefects.add(link.execution_id)
            }
        })
        withDefects.forEach((te) => {
            $(`.test-execution-${te}`).find('.js-bugs').removeClass('hidden')
        })
    })

    // update priority, category & automation status for all executions
    // also tags & components via nested API calls
    jsonRPC('Component.filter', componentQ, componentData => {
        const components = {}
        for (let i = 0; i < componentData.length; i++) {
            components[componentData[i].id] = componentData[i]
        }

        jsonRPC('Tag.filter', tagsQ, tagData => {
            const tags = {}
            for (let i = 0; i < tagData.length; i++) {
                tags[tagData[i].id] = tagData[i]
            }

            jsonRPC('TestCase.filter', casesQuery, testCases => {
                testCases.forEach(testCase => {
                    const row = $(`.test-execution-case-${testCase.id}`)

                    row.find('.test-execution-priority').html(testCase.priority)
                    row.find('.test-execution-category').html(testCase.category)

                    const isAutomatedElement = row.find('.test-execution-automated')
                    const isAutomatedIcon = testCase.is_automated ? 'fa-cog' : 'fa-thumbs-up'
                    const isAutomatedAttr = testCase.is_automated ? isAutomatedElement.data('automated') : isAutomatedElement.data('manual')
                    isAutomatedElement.addClass(isAutomatedIcon)
                    isAutomatedElement.attr('title', isAutomatedAttr)

                    // test case isn't part of the parent test plan
                    if (testCase.plan.indexOf(planId) === -1) {
                        row.find('.js-tc-not-in-tp').toggleClass('hidden')
                    }

                    // render tags and components if available
                    testCase.tagNames = []
                    for (let i = 0; i < testCase.tag.length; i++) {
                        testCase.tagNames.push(tags[testCase.tag[i]].name)
                    }
                    if (testCase.tagNames.length) {
                        row.find('.js-row-tags').toggleClass('hidden')
                        row.find('.js-row-tags').append(testCase.tagNames.join(', '))
                    }

                    testCase.componentNames = []
                    for (let i = 0; i < testCase.component.length; i++) {
                        testCase.componentNames.push(components[testCase.component[i]].name)
                    }
                    if (testCase.componentNames.length) {
                        row.find('.js-row-components').toggleClass('hidden')
                        row.find('.js-row-components').append(testCase.componentNames.join(', '))
                    }

                    // update internal data structure
                    const teID = row.find('.test-execution-checkbox').data('test-execution-id')
                    allExecutions[teID].tags = testCase.tagNames;
                    allExecutions[teID].components = testCase.componentNames;
                })
            })
        })
    })
}

function renderHistoryEntry(historyEntry) {
    if (!historyEntry.history_change_reason) {
        return ''
    }

    const template = $($('#history-entry')[0].content.cloneNode(true))

    template.find('.history-date').html(historyEntry.history_date)
    template.find('.history-user').html(historyEntry.history_user__username)

    // convert to markdown code block for the diff language
    const changeReason = `\`\`\`diff\n${historyEntry.history_change_reason}\n\`\`\``
    markdown2HTML(changeReason, template.find('.history-change-reason')[0])

    return template
}

function renderTestExecutionRow(testExecution) {
    // refresh the internal data structure b/c some fields are used
    // to render the expand area and may have changed via bulk-update meanwhile
    allExecutions[testExecution.id] = testExecution

    const testExecutionRowTemplate = $('#test-execution-row')[0].content
    const template = $(testExecutionRowTemplate.cloneNode(true))

    template.find('.test-execution-checkbox').data('test-execution-id', testExecution.id)
    template.find('.test-execution-checkbox').data('test-execution-case-id', testExecution.case_id)
    template.find('.test-execution-element').addClass(`test-execution-${testExecution.id}`)
    template.find('.test-execution-element').addClass(`test-execution-case-${testExecution.case_id}`)
    template.find('.test-execution-info').html(`TE-${testExecution.id}`)
    template.find('.test-execution-info-link').html(testExecution.case)
    template.find('.test-execution-info-link').attr('href', `/case/${testExecution.case_id}/`)
    template.find('.test-execution-tester').html(testExecution.tested_by || '-')
    template.find('.test-execution-asignee').html(testExecution.assignee || '-')

    const testExecutionStatus = allExecutionStatuses[testExecution.status_id]
    template.find('.test-execution-status-icon').addClass(testExecutionStatus.icon).css('color', testExecutionStatus.color)
    template.find('.test-execution-status-name').html(testExecutionStatus.name).css('color', testExecutionStatus.color)
    // todo: will not be needed when status names come translated from backend
    allExecutions[testExecution.id].status = testExecutionStatus.name

    template.find('.add-link-button').click(() => addLinkToExecutions([testExecution.id]))
    template.find('.one-click-bug-report-button').click(() => fileBugFromExecution(testExecution))

    // remove from expanded list b/c data may have changed
    delete expandedExecutionIds[expandedExecutionIds.indexOf(testExecution.id)]

    // WARNING: only comments related stuff below
    if (!permissions.addComment) {
        template.find('.comment-form').hide()
        return template
    }
    template.find('textarea')[0].id = `comment-for-testexecution-${testExecution.id}`
    template.find('input[type="file"]')[0].id = `file-upload-for-testexecution-${testExecution.id}`

    return template
}

function changeStatusBulk(statusId) {
    const selected = selectedCheckboxes()
    if ($.isEmptyObject(selected)) {
        return false
    }

    selected.executionIds.forEach(executionId => {
        jsonRPC('TestExecution.update', [executionId, {
            'status': statusId,
        }], execution => {
            reloadRowFor(execution)
        })
    })
}

function reloadRowFor(execution) {
    const testExecutionRow = $(`.test-execution-${execution.id}`)
    animate(testExecutionRow, () => {
        testExecutionRow.replaceWith(renderTestExecutionRow(execution))
        // note: this is here b/c animate() is async and we risk race conditions
        // b/c we use global variables for state. The drawback is that progress
        // will be updated even if statuses aren't changed !!!
        drawPercentBar(Object.values(allExecutions))
        renderAdditionalInformation(execution.run_id, execution)

        bindEvents()
    })
}

/////// the functions below were used in bulk-menu actions
/////// and need updates before they can be used again
///////
function changeAssigneeBulk() {
    const selected = selectedCheckboxes()
    if ($.isEmptyObject(selected)) {
        return false
    }

    const enterAssigneeText = $('#test_run_pk').data('trans-enter-assignee-name-or-email')
    const assignee = prompt(enterAssigneeText)

    if (!assignee) {
        return false
    }
    selected.executionIds.forEach(executionId => {
        jsonRPC('TestExecution.update', [executionId, { 'assignee': assignee }], execution => {
            const testExecutionRow = $(`div.list-group-item.test-execution-${executionId}`)
            reloadRowFor(execution)
        })
    })
}

function updateCaseText() {
    const selected = selectedCheckboxes()
    if ($.isEmptyObject(selected)) {
        return false
    }

    selected.executionIds.forEach(executionId =>
        jsonRPC('TestExecution.update', [executionId, { 'case_text_version': 'latest' }], execution => {
            reloadRowFor(execution)
        })
    )
}

function fileBugFromExecution(execution) {

    // remove all previous event handlers
    $('.one-click-bug-report-form').off('submit')

    // this handler must be here, because if we bind it when the page is loaded.
    // we have no way of knowing for what execution ID the form is submitted for.
    $('.one-click-bug-report-form').submit(() => {
        const trackerId = $('.one-click-bug-report-form #id-issue-tracker').val()
        jsonRPC('Bug.report', [execution.id, trackerId], result => {

            // close the modal
            $('#one-click-bug-report-modal button.close').click()

            if (result.rc !== 0) {
                alert(result.response)
                return
            }

            reloadRowFor(execution)

            // unescape b/c Issue #1533
            const targetUrl = result.response.replace(/&amp;/g, '&')
            window.open(targetUrl, '_blank')
        })
        return false
    })

    return true // so that the modal is opened
}

function addLinkToExecutions(testExecutionIDs) {
    // remove all previous event handlers
    $('.add-hyperlink-form').off('submit')

    // this handler must be here, because if we bind it when the page is loaded.
    // we have no way of knowing for what execution ID the form is submitted for.
    $('.add-hyperlink-form').submit(() => {
        const url = $('.add-hyperlink-form #id_url').val()
        const name = $('.add-hyperlink-form #id_name').val()
        const isDefect = $('.add-hyperlink-form #defectCheckbox').is(':checked')
        const updateTracker = true

        testExecutionIDs.forEach(testExecutionId => {
            jsonRPC('TestExecution.add_link', [{
                execution_id: testExecutionId,
                url: url,
                name: name,
                is_defect: isDefect,
            }, updateTracker], link => {
                const testExecutionRow = $(`div.list-group-item.test-execution-${testExecutionId}`)
                animate(testExecutionRow, () => {
                    if (link.is_defect) {
                        testExecutionRow.find('.js-bugs').removeClass('hidden')
                    }
                    const ul = testExecutionRow.find('.test-execution-hyperlinks')
                    ul.append(renderLink(link))
                })
            })
        })

        // clean the values
        $('.add-hyperlink-form #id_url').val('')
        $('.add-hyperlink-form #id_name').val('')
        $('.add-hyperlink-form #defectCheckbox').bootstrapSwitch('state', false)
        $('.add-hyperlink-form #autoUpdateCheckbox').bootstrapSwitch('state', false)

        // close the modal
        $('#add-link-modal button.close').click()

        return false
    })

    return true // so that the modal is opened
}

function renderLink(link) {
    const linkEntryTemplate = $('#link-entry')[0].content
    const template = $(linkEntryTemplate.cloneNode(true))
    if (link.is_defect) {
        template.find('.link-icon').addClass('fa fa-bug')
        const bugTooltip = template.find('.bug-tooltip')
        bugTooltip.css('visibility', 'visible')

        template.find('[data-toggle=popover]')
            .popovers()
            .on('show.bs.popover', () => fetchBugDetails({ href: link.url }, bugTooltip))
    }

    const linkUrlEl = template.find('.link-url')
    linkUrlEl.html(link.name || link.url)
    linkUrlEl.attr('href', link.url)

    return template
}

function removeCases(testRunId, testCaseIds) {
    for (const testCaseId of testCaseIds) {
        jsonRPC('TestRun.remove_case', [testRunId, testCaseId], () => {
            const tePK = $(`.test-execution-case-${testCaseId}`).
                find('.test-execution-checkbox').
                data('test-execution-id')
            $(`.test-execution-case-${testCaseId}`).remove()

            delete expandedExecutionIds[expandedExecutionIds.indexOf(tePK)]
            delete allExecutions[tePK]

            const testExecutionCountEl = $('.test-executions-count')
            const count = parseInt(testExecutionCountEl[0].innerText)
            testExecutionCountEl.html(count - 1)
        }, true)
    }

    drawPercentBar(Object.values(allExecutions))
}