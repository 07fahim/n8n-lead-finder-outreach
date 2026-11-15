# writes the acmebook_leads Data table to an Excel file, Hot first; run: python -I scripts/export_leads.py
import datetime
import sqlite3
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

DATABASE_URI = 'file:D:/Tools/n8n/data/.n8n/database.sqlite?mode=ro'
LEADS_TABLE = 'data_table_user_DwACewp4ryc8HaRW'
COLUMNS = [
    ('tier', 8), ('score', 7), ('name', 32), ('category', 18), ('city', 12), ('country', 8), ('phone', 18),
    ('email', 28), ('whatsapp', 26), ('instagram', 18), ('website', 34), ('tool_status', 15),
    ('tool_name', 18), ('opener', 70), ('reasons', 55), ('address', 36), ('maps_link', 30), ('status', 9),
    ('date_found', 12), ('osm_key', 18),
]
TIER_ORDER = {'Hot': 0, 'Warm': 1, 'Cold': 2}
TIER_FILLS = {'Hot': 'F8CBAD', 'Warm': 'FFE699', 'Cold': 'DDEBF7'}
FONT = 'Arial'


def read_leads():

    database = sqlite3.connect(DATABASE_URI, uri=True)
    database.row_factory = sqlite3.Row
    rows = [dict(row) for row in database.execute(f'select * from {LEADS_TABLE}')]
    return sorted(rows, key=lambda row: (TIER_ORDER.get(row['tier'], 9), -row['score'], row['name']))


def write_leads_sheet(sheet, leads):

    for column_index, (name, width) in enumerate(COLUMNS, start=1):
        cell = sheet.cell(row=1, column=column_index, value=name)
        cell.font = Font(name=FONT, bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='305496')
        sheet.column_dimensions[get_column_letter(column_index)].width = width
    for row_index, lead in enumerate(leads, start=2):
        for column_index, (name, _) in enumerate(COLUMNS, start=1):
            value = lead[name]
            if name == 'score':
                value = int(value)
            if name == 'date_found' and value:
                value = str(value)[:10]
            cell = sheet.cell(row=row_index, column=column_index, value=value)
            cell.font = Font(name=FONT)
            cell.alignment = Alignment(vertical='top', wrap_text=name in ('opener', 'reasons'))
        sheet.cell(row=row_index, column=1).fill = PatternFill('solid', fgColor=TIER_FILLS.get(lead['tier'], 'FFFFFF'))
    sheet.freeze_panes = 'D2'
    sheet.auto_filter.ref = f'A1:{get_column_letter(len(COLUMNS))}{len(leads) + 1}'


def write_summary_sheet(sheet, leads):

    cities = sorted({lead['city'] for lead in leads})
    headers = ['City', 'Hot', 'Warm', 'Cold', 'Total']
    for column_index, header in enumerate(headers, start=1):
        cell = sheet.cell(row=1, column=column_index, value=header)
        cell.font = Font(name=FONT, bold=True)
    for row_index, city in enumerate(cities, start=2):
        sheet.cell(row=row_index, column=1, value=city).font = Font(name=FONT)
        for column_index, tier in enumerate(['Hot', 'Warm', 'Cold'], start=2):
            formula = f'=COUNTIFS(Leads!$E:$E,$A{row_index},Leads!$A:$A,"{tier}")'
            sheet.cell(row=row_index, column=column_index, value=formula).font = Font(name=FONT)
        sheet.cell(row=row_index, column=5, value=f'=SUM(B{row_index}:D{row_index})').font = Font(name=FONT)
    total_row = len(cities) + 2
    sheet.cell(row=total_row, column=1, value='All cities').font = Font(name=FONT, bold=True)
    for column_index in range(2, 6):
        letter = get_column_letter(column_index)
        cell = sheet.cell(row=total_row, column=column_index, value=f'=SUM({letter}2:{letter}{total_row - 1})')
        cell.font = Font(name=FONT, bold=True)
    notes = [
        f'Exported {datetime.date.today().isoformat()} from the n8n Data table acmebook_leads; counts recalculate '
        'from the Leads sheet.',
        'Tiers: Hot 60+, Warm 40-59, Cold under 40 (scores from the lead finder).',
        "Before contacting a lead, open its website: OpenStreetMap data can be wrong (a dead or reused domain, a "
        'chain not tagged as one).',
        'Cold email and WhatsApp rules differ by country (UK/IE PECR, Canada CASL, Australia Spam Act).',
    ]
    for offset, note in enumerate(notes):
        sheet.cell(row=total_row + 2 + offset, column=1, value=note).font = Font(name=FONT, italic=True)
    sheet.column_dimensions['A'].width = 14


def run(output_path: str):

    leads = read_leads()
    workbook = Workbook()
    leads_sheet = workbook.active
    leads_sheet.title = 'Leads'
    write_leads_sheet(leads_sheet, leads)
    write_summary_sheet(workbook.create_sheet('Summary'), leads)
    # excel computes the summary formulas when the file opens; no cached values are written here
    workbook.calculation.fullCalcOnLoad = True
    workbook.save(output_path)
    print(f"wrote '{output_path}' [{len(leads)}] leads")



if __name__ == '__main__':
    run(sys.argv[1] if len(sys.argv) > 1 else f'exports/acmebook_leads_{datetime.date.today().isoformat()}.xlsx')
