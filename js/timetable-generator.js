// Timetable Generation Algorithm - UNBIASED SYMMETRIC SOLVER
// Features: Dynamic Shuffling to prevent class-hogging + NULL Resource tracking.

function escapeHtmlDisplay(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

async function generateTimetable() {
    const selectedClass = document.getElementById('timetableClass').value;
    const container = document.getElementById('timetableContainer');
    const logContainer = document.getElementById('generationLog');
    const logContent = document.getElementById('logContent');

    container.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>AI is solving with Random-Access optimization...<br><small id="progressCount">Breaking bias...</small></p></div>`;

    const logs = [];
    const log = (msg) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

    try {
        const [classesS, subjectsS, teachersS, roomsS, slotsS, allTimetablesS] = await Promise.all([
            database.ref('classes').once('value'), database.ref('subjects').once('value'),
            database.ref('teachers').once('value'), database.ref('rooms').once('value'),
            database.ref('slots').once('value'), database.ref('timetables').once('value')
        ]);

        const classes = classesS.val() || {};
        const subjects = subjectsS.val() || {};
        const teachers = teachersS.val() || {};
        const rooms = roomsS.val() || {};
        const slots = slotsS.val() || {};
        const allTimetables = allTimetablesS.val() || {};

        const tMap = {};
        const rMap = {};
        const cMap = {};
        
        // Initialize Maps (Including 'NULL' as a valid ID if it's used in the data)
        const initMap = (id) => { if (!tMap[id]) tMap[id] = {}; };
        Object.keys(teachers).forEach(initMap);
        Object.keys(rooms).forEach(id => rMap[id] = {});
        Object.keys(classes).forEach(id => cMap[id] = {});

        // Pre-load global conflicts
        Object.entries(allTimetables).forEach(([cid, classTimetable]) => {
            if (cid !== selectedClass) {
                Object.entries(classTimetable).forEach(([slotId, entry]) => {
                    const mark = (id, map) => { if (id) { if (!map[id]) map[id] = {}; map[id][slotId] = true; } };
                    if (entry.subjectType !== 'batch-practical' && !entry.batchSchedule) {
                        mark(entry.teacherId, tMap);
                        mark(entry.roomId, rMap);
                    }
                    if (entry.batchSchedule) {
                        Object.values(entry.batchSchedule).forEach(b => {
                            mark(b.teacherId, tMap);
                            mark(b.roomId, rMap);
                        });
                    }
                });
            }
        });

        const targetClasses = selectedClass ? { [selectedClass]: classes[selectedClass] } : classes;
        const timetableEntries = {};

        for (const [classId, classData] of Object.entries(targetClasses)) {
            log(`Solving ${classData.name} with Unbiased Priority...`);
            timetableEntries[classId] = {};
            const pool = [];
            const batchItemsByBatch = {};

            Object.entries(subjects).filter(([_, s]) => s.classId === classId).forEach(([id, s]) => {
                const count = parseInt(s.lecturesPerWeek) || 0;
                for (let i = 0; i < count; i++) {
                    if (s.isBatchBased) {
                        Object.entries(s.batchTeachers || {}).forEach(([b, ti]) => {
                            if (!batchItemsByBatch[b]) batchItemsByBatch[b] = [];
                            batchItemsByBatch[b].push({
                                id: `${id}_${b}`,
                                realId: id,
                                data: s,
                                batch: b,
                                teacherId: ti,
                                labId: s.batchLabs ? s.batchLabs[b] : null,
                                duration: parseInt(s.practicalDuration) || 2
                            });
                        });
                    } else {
                        pool.push({ 
                            id, data: s, 
                            type: s.type === 'practical' ? 'practical' : 'theory', 
                            duration: parseInt(s.practicalDuration) || (s.type === 'practical' ? 2 : 1)
                        });
                    }
                }
            });

            let hasMore = true;
            while (hasMore) {
                hasMore = false;
                const groupItems = [];
                let maxDuration = 0;
                
                const usedTeachers = new Set();
                const usedLabs = new Set();
                
                const batches = Object.keys(batchItemsByBatch).sort(() => Math.random() - 0.5);
                batches.forEach(b => {
                    if (batchItemsByBatch[b].length > 0) {
                        let foundIdx = -1;
                        for (let i = 0; i < batchItemsByBatch[b].length; i++) {
                            const item = batchItemsByBatch[b][i];
                            if (usedTeachers.has(item.teacherId)) continue;
                            if (item.labId && usedLabs.has(item.labId)) continue;
                            foundIdx = i;
                            break;
                        }
                        
                        if (foundIdx !== -1) {
                            const item = batchItemsByBatch[b].splice(foundIdx, 1)[0];
                            groupItems.push(item);
                            usedTeachers.add(item.teacherId);
                            if (item.labId) usedLabs.add(item.labId);
                            if (item.duration > maxDuration) maxDuration = item.duration;
                        }
                    }
                });
                
                batches.forEach(b => {
                    if (batchItemsByBatch[b].length > 0) hasMore = true;
                });
                
                if (groupItems.length > 0) {
                    pool.push({
                        type: 'batch-group',
                        items: groupItems,
                        duration: maxDuration || 2
                    });
                }
            }

            let totalPeriodsNeeded = 0;
            pool.forEach(p => totalPeriodsNeeded += p.duration);
            const maxPeriodsPerDay = Math.min(9, Math.ceil(totalPeriodsNeeded / 5) + 1);

            // Randomize pool to prevent subject-bias
            pool.sort(() => Math.random() - 0.5);

            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
            // SHUFFLE DAYS for each class to prevent "Monday Hogging"
            const shuffledDays = [...dayNames].sort(() => Math.random() - 0.5);
            
            const dayMeta = shuffledDays.map(d => ({ 
                name: d, prefix: d.substring(0, 3), 
                slots: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(p => {
                    const sid = `${d.substring(0, 3)}-P${p}`;
                    return slots[sid] && slots[sid].type !== 'break';
                })
            }));

            let it = 0;
            const MAX_IT = 50000;
            let bestPartial = null;
            let bestPartialCount = 0;

            async function solve(idx, dIdx, sIdx) {
                it++;
                if (it % 1500 === 0) {
                    const el = document.getElementById('progressCount');
                    if (el) el.textContent = `Retrying for ${classData.name}... (Try ${it})`;
                    await new Promise(r => setTimeout(r, 0));
                }

                if (idx >= pool.length) return true;
                if (dIdx >= 5 || it > MAX_IT) return false;

                // Snapshot the best partial result seen so far
                const placed = Object.keys(timetableEntries[classId]).length;
                if (placed > bestPartialCount) {
                    bestPartialCount = placed;
                    bestPartial = JSON.parse(JSON.stringify(timetableEntries[classId]));
                }

                const day = dayMeta[dIdx];
                if (sIdx >= day.slots.length) return await solve(idx, dIdx + 1, 0);

                const period = day.slots[sIdx];
                for (let i = idx; i < pool.length; i++) {
                    const sub = pool[i];
                    const roomId = findRoom(sub, day.name, period);
                    
                    if (roomId && check(sub, day.name, period)) {
                        [pool[idx], pool[i]] = [pool[i], pool[idx]];
                        assign(sub, day.name, period, roomId);
                        if (await solve(idx + 1, dIdx, sIdx + sub.duration)) return true;
                        unassign(sub, day.name, period, roomId);
                        [pool[idx], pool[i]] = [pool[i], pool[idx]];
                    }
                }
                // Allowed to start a class later in the day if morning is fully blocked
                if (sIdx === 0 && day.slots.length > 0) {
                    if (await solve(idx, dIdx, 1)) return true;
                }
                
                return await solve(idx, dIdx + 1, 0);
            }

            function findRoom(sub, d, p) {
                const dp = d.substring(0, 3);
                
                if (sub.type === 'batch-group') {
                    const groupRooms = {};
                    const usedTheoryRooms = new Set();
                    
                    for (const item of sub.items) {
                        if (item.labId) {
                            for (let x = 0; x < item.duration; x++) {
                                if (rMap[item.labId]?.[`${dp}-P${p + x}`]) return null;
                            }
                            groupRooms[item.batch] = item.labId;
                        } else {
                            const crs = Object.entries(rooms).map(([id]) => id);
                            let found = null;
                            for (const rid of crs) {
                                if (usedTheoryRooms.has(rid)) continue;
                                let ok = true;
                                for (let x = 0; x < item.duration; x++) {
                                    if (rMap[rid]?.[`${dp}-P${p + x}`]) { ok = false; break; }
                                }
                                if (ok) {
                                    found = rid;
                                    break;
                                }
                            }
                            if (!found) return null;
                            groupRooms[item.batch] = found;
                            usedTheoryRooms.add(found);
                        }
                    }
                    return groupRooms;
                }

                if (sub.type === 'practical' && sub.data.labRoomId) {
                    const rid = sub.data.labRoomId;
                    for (let x = 0; x < sub.duration; x++) if (rMap[rid]?.[`${dp}-P${p + x}`]) return null;
                    return rid;
                }
                
                const crs = Object.entries(rooms).filter(([_, r]) => r.type !== 'lab').map(([id]) => id);
                for (const rid of crs) {
                    let ok = true;
                    for (let x = 0; x < sub.duration; x++) if (rMap[rid]?.[`${dp}-P${p + x}`]) { ok = false; break; }
                    if (ok) return rid;
                }
                return null;
            }

            function check(sub, d, p) {
                const dp = d.substring(0, 3);
                
                const currentDaySlots = Object.keys(timetableEntries[classId] || {}).filter(tid => tid.startsWith(dp)).length;
                if (currentDaySlots + sub.duration > maxPeriodsPerDay) return false;
                
                let count = 0;
                Object.values(timetableEntries[classId] || {}).forEach(e => {
                    if (e.dayPrefix === dp && sub.type !== 'batch-group') {
                        if (e.subjectId === sub.id) count++;
                    }
                });
                
                if (sub.type === 'batch-group') {
                    for (const item of sub.items) {
                        let itemCount = 0;
                        Object.values(timetableEntries[classId] || {}).forEach(e => {
                            if (e.dayPrefix === dp && e.batchSchedule && e.batchSchedule[item.batch] && e.batchSchedule[item.batch].subjectId === item.realId) {
                                itemCount++;
                            }
                        });
                        if (itemCount > 0) return false;
                    }
                } else if (sub.type === 'practical') {
                    if (count > 0) return false; 
                } else {
                    if (count >= 2) return false;
                }

                for (let x = 0; x < sub.duration; x++) {
                    const tid = `${dp}-P${p + x}`;
                    const cStatus = cMap[classId][tid];
                    if (cStatus === 'whole') return false;
                    
                    if (sub.type === 'batch-group') {
                        if (Array.isArray(cStatus)) {
                            for (const item of sub.items) {
                                if (x >= item.duration) continue;
                                if (cStatus.includes(item.batch)) return false;
                            }
                        }
                    } else {
                        if (cStatus) return false;
                    }

                    const verify = (id) => {
                        if (!id) return true;
                        if (tMap[id] && tMap[id][tid]) return false;
                        if (teachers[id]?.unavailableSlots?.includes(tid)) return false;
                        return true;
                    };
                    
                    if (sub.type === 'batch-group') {
                        for (const item of sub.items) {
                            if (x >= item.duration) continue;
                            if (!verify(item.teacherId)) return false;
                        }
                    } else {
                        if (!verify(sub.data.teacherId)) return false;
                    }
                }
                return true;
            }

            function assign(sub, d, p, rid) {
                const dp = d.substring(0, 3);
                for (let x = 0; x < sub.duration; x++) {
                    const tid = `${dp}-P${p + x}`;
                    const mark = (id, map) => { if (id) { if (!map[id]) map[id] = {}; map[id][tid] = true; } };
                    
                    if (sub.type === 'batch-group') {
                        if (!Array.isArray(cMap[classId][tid])) cMap[classId][tid] = [];
                        if (!timetableEntries[classId][tid]) {
                            timetableEntries[classId][tid] = { subjectType: 'batch-practical', batchSchedule: {}, dayPrefix: dp };
                        }
                        
                        for (const item of sub.items) {
                            if (x >= item.duration) continue;
                            
                            cMap[classId][tid].push(item.batch);
                            const itemRid = rid[item.batch];
                            mark(item.teacherId, tMap);
                            mark(itemRid, rMap);
                            
                            timetableEntries[classId][tid].batchSchedule[item.batch] = {
                                subjectId: item.realId,
                                subjectName: item.data.name || item.realId,
                                teacherId: item.teacherId,
                                teacherName: teachers[item.teacherId]?.name || item.teacherId || 'NULL',
                                roomId: itemRid,
                                roomName: rooms[itemRid]?.name || itemRid || 'NULL'
                            };
                        }
                    } else {
                        cMap[classId][tid] = 'whole';
                        timetableEntries[classId][tid] = {
                            subjectId: sub.id, subjectName: sub.data.name || sub.id, teacherId: sub.data.teacherId,
                            teacherName: teachers[sub.data.teacherId]?.name || sub.data.teacherId || 'NULL',
                            roomId: rid, roomName: rooms[rid]?.name || rid || 'NULL', dayPrefix: dp, subjectType: sub.type
                        };
                        mark(sub.data.teacherId, tMap);
                        mark(rid, rMap);
                    }
                }
            }

            function unassign(sub, d, p, rid) {
                const dp = d.substring(0, 3);
                for (let x = 0; x < sub.duration; x++) {
                    const tid = `${dp}-P${p + x}`;
                    const unmark = (id, map) => { if (id && map[id]) delete map[id][tid]; };
                    
                    if (sub.type === 'batch-group') {
                        for (const item of sub.items) {
                            if (x >= item.duration) continue;
                            
                            const itemRid = rid[item.batch];
                            unmark(item.teacherId, tMap);
                            unmark(itemRid, rMap);
                            
                            if (Array.isArray(cMap[classId][tid])) {
                                cMap[classId][tid] = cMap[classId][tid].filter(b => b !== item.batch);
                            }
                            
                            if (timetableEntries[classId][tid] && timetableEntries[classId][tid].batchSchedule) {
                                delete timetableEntries[classId][tid].batchSchedule[item.batch];
                            }
                        }
                        
                        if (Array.isArray(cMap[classId][tid]) && cMap[classId][tid].length === 0) {
                            delete cMap[classId][tid];
                        }
                        if (timetableEntries[classId][tid] && timetableEntries[classId][tid].batchSchedule && Object.keys(timetableEntries[classId][tid].batchSchedule).length === 0) {
                            delete timetableEntries[classId][tid];
                        }
                    } else {
                        unmark(sub.data.teacherId, tMap);
                        unmark(rid, rMap);
                        delete cMap[classId][tid];
                        delete timetableEntries[classId][tid];
                    }
                }
            }

            let solved = false;
            for (let attempt = 1; attempt <= 5 && !solved; attempt++) {
                it = 0;
                timetableEntries[classId] = {};
                cMap[classId] = {};
                pool.sort(() => Math.random() - 0.5);
                dayMeta.sort(() => Math.random() - 0.5);
                if (attempt > 1) log(`Retry attempt ${attempt} for ${classData.name}...`);
                solved = await solve(0, 0, 0);
            }

            const finalEntries = solved ? timetableEntries[classId] : (bestPartial || {});
            const status = solved ? 'draft' : (bestPartialCount > 0 ? 'partial' : 'failed');
            if (!solved) log(`Warning: Could not fully schedule ${classData.name}. Saved best partial result (${bestPartialCount} slots placed).`);
            
            if (!window.previewTimetables) window.previewTimetables = {};
            window.previewTimetables[classId] = { ...finalEntries, updatedAt: Date.now(), status: 'preview' };
        }

        const targetId = selectedClass || Object.keys(targetClasses)[0];
        displayTimetable(targetId);
        if (typeof showTimetableActions === 'function') {
            showTimetableActions(targetId, window.previewTimetables[targetId]);
        }
        showToast('Unified Generation Complete! Previewing...', 'success');
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function displayTimetable(classId, batchFilter = null) {
    const container = document.getElementById('timetableContainer');
    const title = document.getElementById('timetableTitle');
    const [sSnap, cSnap] = await Promise.all([
        database.ref('slots').once('value'),
        database.ref(`classes/${classId}`).once('value')
    ]);
    
    let timetable = {};
    if (window.previewTimetables && window.previewTimetables[classId]) {
        timetable = window.previewTimetables[classId];
    } else {
        const tSnap = await database.ref(`timetables/${classId}`).once('value');
        timetable = tSnap.val() || {};
    }
    
    const slots = sSnap.val() || {};
    const classData = cSnap.val() || { name: classId };
    const displayName = timetable.draftName || classData.name;
    title.innerHTML = `<span>Timetable: ${displayName}</span>`;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const pOrder = [1, 2, 3, 4, 'B1', 5, 6, 7, 'B2', 8, 9];
    const pInfo = {};
    Object.values(slots).forEach(s => pInfo[s.period] = s);
    let html = '<div class="table-responsive"><table class="timetable"><thead><tr><th>Day / Period</th>';
    pOrder.forEach(p => {
        if (pInfo[p]) {
            const pi = pInfo[p];
            html += `<th class="${pi.type === 'break' ? 'break-header' : ''}">${pi.type === 'break' ? (pi.label || 'Break') : 'P'+pi.period}<br><small>${pi.start}-${pi.end}</small></th>`;
        }
    });
    html += '</tr></thead><tbody>';
    days.forEach(day => {
        html += `<tr><td class="day-header">${day}</td>`;
        pOrder.forEach(p => {
            if (pInfo[p]) {
                const pi = pInfo[p];
                if (pi.type === 'break') {
                    html += `<td class="slot-cell break-cell">${pi.label || 'Break'}</td>`;
                } else {
                    const slotId = `${day.substring(0, 3)}-P${pi.period}`;
                    const e = timetable[slotId];
                    if (e) {
                        if (e.batchSchedule) {
                            let filteredBatches = Object.entries(e.batchSchedule);
                            if (batchFilter) {
                                filteredBatches = filteredBatches.filter(([b]) => b === batchFilter);
                            }
                            
                            if (filteredBatches.length > 0) {
                                let g = filteredBatches.map(([b, i]) => `
                                    <div class="batch-item"><span class="badge bg-info">${b}</span><strong>${escapeHtmlDisplay(i.subjectName)}</strong><br><small>${escapeHtmlDisplay(i.teacherName)} | ${escapeHtmlDisplay(i.roomName)}</small></div>`).join('');
                                html += `<td class="slot-cell batch-practical-cell"><div class="batch-grid">${g}</div></td>`;
                            } else {
                                html += '<td class="slot-cell empty">-</td>';
                            }
                        } else {
                            html += `<td class="slot-cell ${e.subjectType === 'practical' ? 'practical-cell' : ''}"><div class="subject">${escapeHtmlDisplay(e.subjectName)}</div><div class="teacher">${escapeHtmlDisplay(e.teacherName)}</div><div class="room">${escapeHtmlDisplay(e.roomName)}</div></td>`;
                        }
                    } else { html += '<td class="slot-cell empty">-</td>'; }
                }
            }
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}
window.displayTimetableWithBatchFilter = displayTimetable;
