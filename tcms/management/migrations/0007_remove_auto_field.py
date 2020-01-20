# Generated by Django 3.0.2 on 2020-01-20 16:48

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0006_remove_autofield_max_length'),
    ]

    operations = [
        migrations.AlterField(
            model_name='classification',
            name='id',
            field=models.AutoField(auto_created=True, primary_key=True,
                                   serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='component',
            name='id',
            field=models.AutoField(auto_created=True, primary_key=True,
                                   serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='priority',
            name='id',
            field=models.AutoField(auto_created=True, primary_key=True,
                                   serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='product',
            name='id',
            field=models.AutoField(auto_created=True, primary_key=True,
                                   serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='version',
            name='id',
            field=models.AutoField(auto_created=True, primary_key=True,
                                   serialize=False, verbose_name='ID'),
        ),
    ]