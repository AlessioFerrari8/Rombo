import { Component, computed, input, output } from '@angular/core';
import { SQL_BASES, SqlBase, formatSqlType, parseSqlType } from '../../domain/sql-type';

@Component({ selector: 'app-type-picker', templateUrl: './type-picker.html', host: { class: 'flex gap-1' } })
export class TypePicker {
  readonly value = input<string | undefined>(undefined);
  readonly disabled = input(false);
  readonly changed = output<string>();
  protected readonly bases = SQL_BASES;
  protected readonly parts = computed(() => parseSqlType(this.value()));
  protected readonly info = computed(() => SQL_BASES.find((b) => b.base === this.parts().base)!);

  setBase(base: string): void {
    this.changed.emit(formatSqlType({ base: base as SqlBase }));
  }
  setA(v: string): void {
    this.changed.emit(formatSqlType({ ...this.parts(), a: Number(v) }));
  }
  setB(v: string): void {
    this.changed.emit(formatSqlType({ ...this.parts(), b: Number(v) }));
  }
}
